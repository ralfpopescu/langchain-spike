/**
 * LangChain implementation of the agent wrapper
 */

import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { AgentWrapper, AgentTool, AgentResponse, StreamingCallbacks } from "./types.js";

export class LangChainAgent implements AgentWrapper {
    private model: ChatOpenAI;
    private tools: DynamicStructuredTool[];
    private systemPrompt: string;
    private maxIterations: number;

    constructor(
        systemPrompt: string,
        tools: AgentTool[],
        modelName: string = "gpt-4o-mini",
        temperature: number = 0,
        maxIterations: number = 25
    ) {
        this.systemPrompt = systemPrompt;
        this.maxIterations = maxIterations;
        this.model = new ChatOpenAI({
            model: modelName,
            temperature,
            streaming: true,
        });

        // Convert AgentTool to LangChain DynamicStructuredTool
        this.tools = tools.map(tool => new DynamicStructuredTool({
            name: tool.name,
            description: tool.description,
            schema: tool.schema,
            func: tool.func,
        }));
    }

    async executeStreaming(
        userInput: string,
        chatHistory: Array<{ role: "USER" | "MODEL"; content: string }>,
        callbacks: StreamingCallbacks
    ): Promise<AgentResponse> {
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", this.systemPrompt],
            new MessagesPlaceholder("chat_history"),
            ["human", "{input}"],
            new MessagesPlaceholder("agent_scratchpad"),
        ]);

        const agent = await createToolCallingAgent({
            llm: this.model,
            tools: this.tools,
            prompt
        });

        const executor = new AgentExecutor({
            agent,
            tools: this.tools,
            maxIterations: this.maxIterations,
            returnIntermediateSteps: true,
            verbose: true,
        });

        // Convert chat history to LangChain messages
        const history = chatHistory.map((m) =>
            m.role === "USER"
                ? new HumanMessage(m.content)
                : new AIMessage(m.content)
        );

        const result = await executor.invoke(
            {
                input: userInput,
                chat_history: history,
            },
            {
                callbacks: [
                    {
                        handleLLMNewToken: async (token: string) => {
                            if (callbacks.onToken) {
                                await callbacks.onToken(token);
                            }
                        },
                    },
                ],
            }
        );

        if (callbacks.onComplete) {
            await callbacks.onComplete();
        }

        const content = typeof result.output === "string" ? result.output : JSON.stringify(result.output);

        // Extract tool calls from intermediate steps
        const toolCalls = (result.intermediateSteps || []).map((step: any) => ({
            name: step.action?.tool || "unknown",
            args: step.action?.toolInput || {},
            result: step.observation || "",
        }));

        return {
            content,
            toolCalls,
        };
    }
}

