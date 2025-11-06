import { z } from "zod";
import { pubsub, topics } from "../pubsub.js";
import { appendToBody } from "../store.js";
import { v4 as uuid } from "uuid";

export const AddNodeArgsSchema = z.object({
  tag: z.string().min(1).describe("HTML tag name to append, e.g., 'div'"),
  text: z.string().optional().describe("Optional textContent for the element"),
  attributes: z.record(z.string()).optional().describe("HTML attributes as key-value pairs"),
});

export type AddNodeArgs = z.infer<typeof AddNodeArgsSchema>;

export async function addNodeTool(sessionId: string, args: AddNodeArgs) {
  const id = uuid();
  const started = {
    id,
    sessionId,
    name: "add_node",
    args,
    type: "STARTED" as const,
    timestamp: new Date(),
  };
  await pubsub.publish(topics.toolEvent(sessionId), { toolEvent: started });

  const attrString = args.attributes
    ? Object.entries(args.attributes)
        .map(([k, v]) => `${k}="${v.replaceAll('"', '&quot;')}"`)
        .join(" ")
    : "";
  const open = attrString.length > 0 ? `<${args.tag} ${attrString}>` : `<${args.tag}>`;
  const text = args.text ?? "";
  const html = `${open}${text}</${args.tag}>`;

  const progress = {
    id,
    sessionId,
    name: "add_node",
    args: { htmlPreview: html.slice(0, 80) },
    type: "PROGRESS" as const,
    timestamp: new Date(),
  };
  await pubsub.publish(topics.toolEvent(sessionId), { toolEvent: progress });

  const { index } = appendToBody(sessionId, html);

  await pubsub.publish(topics.documentUpdated(sessionId), {
    documentUpdated: {
      id,
      sessionId,
      html,
      index,
    },
  });

  const completed = {
    id,
    sessionId,
    name: "add_node",
    args: { index },
    type: "COMPLETED" as const,
    timestamp: new Date(),
  };
  await pubsub.publish(topics.toolEvent(sessionId), { toolEvent: completed });

  return { id, html, index };
}

