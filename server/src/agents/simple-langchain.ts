/**
 * Simple LangChain wrapper for executing prompt templates
 * No tools, no agents - just straightforward prompt template execution
 * 
 * Supports multiple providers: OpenAI, Anthropic, and Google Gemini
 * 
 * Note: To use Anthropic or Gemini, install the required packages:
 *   npm install @langchain/anthropic @langchain/google-genai
 */

import { ChatOpenAI } from "@langchain/openai";
// Uncomment these imports after installing the packages:
// import { ChatAnthropic } from "@langchain/anthropic";
// import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StreamingCallbacks } from "./types.js";

export type ModelProvider = "openai" | "anthropic" | "gemini";

export interface SimpleResponse {
    content: string;
}

/**
 * Lightweight wrapper that executes a prompt template with optional chat history
 */
export class SimpleLangChain {
    private model: BaseChatModel;
    private promptTemplate: ChatPromptTemplate;

    constructor(
        systemPrompt: string,
        provider: ModelProvider = "openai",
        modelName?: string,
        temperature: number = 0.7
    ) {
        // Initialize the appropriate model based on provider
        switch (provider) {
            case "openai":
                this.model = new ChatOpenAI({
                    model: modelName || "gpt-4o-mini",
                    temperature,
                    streaming: true,
                }) as BaseChatModel;
                break;

            case "anthropic":
                // Requires: npm install @langchain/anthropic
                // Uncomment after installing:
                /*
                this.model = new ChatAnthropic({
                  model: modelName || "claude-3-5-sonnet-20241022",
                  temperature,
                  streaming: true,
                }) as BaseChatModel;
                */
                throw new Error(
                    "Anthropic support requires @langchain/anthropic package. " +
                    "Install with: npm install @langchain/anthropic"
                );

            case "gemini":
                // Requires: npm install @langchain/google-genai
                // Uncomment after installing:
                /*
                this.model = new ChatGoogleGenerativeAI({
                  model: modelName || "gemini-1.5-flash",
                  temperature,
                  streaming: true,
                }) as BaseChatModel;
                */
                throw new Error(
                    "Gemini support requires @langchain/google-genai package. " +
                    "Install with: npm install @langchain/google-genai"
                );

            default:
                throw new Error(`Unknown provider: ${provider}`);
        }

        // Simple prompt template with system message and chat history support
        this.promptTemplate = ChatPromptTemplate.fromMessages([
            ["system", systemPrompt],
            ["placeholder", "{chat_history}"],
            ["human", "{input}"],
        ]);
    }

    /**
     * Execute the prompt with streaming support
     */
    async executeStreaming(
        userInput: string,
        chatHistory: Array<{ role: "USER" | "MODEL"; content: string }> = [],
        callbacks: StreamingCallbacks = {}
    ): Promise<SimpleResponse> {
        // Convert chat history to LangChain messages
        const history = chatHistory.map((m) =>
            m.role === "USER"
                ? new HumanMessage(m.content)
                : new AIMessage(m.content)
        );

        // Format the prompt with user input and history
        const formattedPrompt = await this.promptTemplate.invoke({
            input: userInput,
            chat_history: history,
        });

        // Stream the response
        const stream = await this.model.stream(formattedPrompt);

        let fullContent = "";

        for await (const chunk of stream) {
            const token = chunk.content.toString();
            fullContent += token;

            if (callbacks.onToken) {
                await callbacks.onToken(token);
            }
        }

        if (callbacks.onComplete) {
            await callbacks.onComplete();
        }

        return {
            content: fullContent,
        };
    }

    /**
     * Execute the prompt without streaming (returns complete response)
     */
    async execute(
        userInput: string,
        chatHistory: Array<{ role: "USER" | "MODEL"; content: string }> = []
    ): Promise<SimpleResponse> {
        // Convert chat history to LangChain messages
        const history = chatHistory.map((m) =>
            m.role === "USER"
                ? new HumanMessage(m.content)
                : new AIMessage(m.content)
        );

        // Format and invoke the prompt
        const formattedPrompt = await this.promptTemplate.invoke({
            input: userInput,
            chat_history: history,
        });

        const response = await this.model.invoke(formattedPrompt);

        return {
            content: response.content.toString(),
        };
    }
}

// Example usage (commented out):
/*
// OpenAI example
const openaiAgent = new SimpleLangChain(
  "You are a helpful assistant that answers questions concisely.",
  "openai",
  "gpt-4o-mini"
);

// Anthropic example (requires @langchain/anthropic)
const anthropicAgent = new SimpleLangChain(
  "You are a helpful assistant that answers questions concisely.",
  "anthropic",
  "claude-3-5-sonnet-20241022"
);

// Gemini example (requires @langchain/google-genai)
const geminiAgent = new SimpleLangChain(
  "You are a helpful assistant that answers questions concisely.",
  "gemini",
  "gemini-1.5-flash"
);

// With streaming
const response = await openaiAgent.executeStreaming(
  "What is the capital of France?",
  [],
  {
    onToken: async (token) => {
      process.stdout.write(token);
    },
    onComplete: async () => {
      console.log("\n[Complete]");
    }
  }
);

// Without streaming, with chat history
const response2 = await openaiAgent.execute(
  "What is 2 + 2?",
  [{ role: "USER", content: "Hello" }, { role: "MODEL", content: "Hi there!" }]
);
console.log(response2.content);

// Environment variables needed:
// - OpenAI: OPENAI_API_KEY
// - Anthropic: ANTHROPIC_API_KEY
// - Gemini: GOOGLE_API_KEY
*/

