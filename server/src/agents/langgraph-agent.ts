/**
 * LangGraph implementation of the agent wrapper
 */

import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from "@langchain/core/messages";
import type { AgentWrapper, AgentTool, AgentResponse, StreamingCallbacks } from "./types.js";

export class LangGraphAgent implements AgentWrapper {
    private model: ChatOpenAI;
    private tools: any[];
    private systemPrompt: string;

    constructor(
        systemPrompt: string,
        tools: AgentTool[],
        modelName: string = "gpt-4o-mini",
        temperature: number = 0
    ) {
        this.systemPrompt = systemPrompt;
        this.model = new ChatOpenAI({
            model: modelName,
            temperature,
            streaming: true,
        });

        // Convert AgentTool (with Zod schema) to LangGraph format
        // LangGraph tools also accept Zod schemas natively
        this.tools = tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            schema: tool.schema, // Zod schema used by LangGraph for validation
            invoke: tool.func,
            call: async function (input: string) {
                const parsed = JSON.parse(input);
                return this.invoke(parsed);
            },
        }));
    }

    async executeStreaming(
        userInput: string,
        chatHistory: Array<{ role: "USER" | "MODEL"; content: string }>,
        callbacks: StreamingCallbacks
    ): Promise<AgentResponse> {
        const modelWithTools = this.model.bindTools(this.tools);

        // Convert chat history to LangChain messages
        const history: BaseMessage[] = chatHistory.map((m) =>
            m.role === "USER"
                ? new HumanMessage(m.content)
                : new AIMessage(m.content)
        );

        // Define the function that calls the model
        const callModel = async (state: typeof MessagesAnnotation.State) => {
            const systemMessage = new SystemMessage(this.systemPrompt);
            const messages = [systemMessage, ...state.messages];

            const response = await modelWithTools.invoke(messages, {
                callbacks: [
                    {
                        handleLLMNewToken: async (token: string) => {
                            if (callbacks.onToken) {
                                await callbacks.onToken(token);
                            }
                        },
                    },
                ],
            });

            return { messages: [response] };
        };

        // Define the conditional edge logic
        const shouldContinue = (state: typeof MessagesAnnotation.State) => {
            const lastMessage = state.messages[state.messages.length - 1];

            // If the LLM makes a tool call, then we route to the "tools" node
            if (lastMessage._getType() === "ai" && "tool_calls" in lastMessage) {
                const aiMessage = lastMessage as AIMessage;
                if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
                    return "tools";
                }
            }
            // Otherwise, we stop (reply to the user)
            return END;
        };

        // Create the graph
        const workflow = new StateGraph(MessagesAnnotation)
            .addNode("agent", callModel)
            .addNode("tools", new ToolNode(this.tools))
            .addEdge(START, "agent")
            .addConditionalEdges("agent", shouldContinue)
            .addEdge("tools", "agent");

        const graph = workflow.compile();

        // Initialize state with chat history and new user input
        const initialMessages = [...history, new HumanMessage(userInput)];

        const result = await graph.invoke({
            messages: initialMessages,
        });

        if (callbacks.onComplete) {
            await callbacks.onComplete();
        }

        // Extract the final AI response
        const finalMessages = result.messages;
        const lastAIMessage = [...finalMessages].reverse().find((m: BaseMessage) => m._getType() === "ai");

        const content = lastAIMessage?.content?.toString() || "";

        return {
            content,
            toolCalls: [], // LangGraph doesn't expose intermediate steps easily
        };
    }
}

