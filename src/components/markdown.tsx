import { MessageResponse } from "@/components/ai-elements/message";

export function MarkdownContent({ text }: { text: string }) {
  return <MessageResponse className="markdown-content">{text}</MessageResponse>;
}
