export const ARCHITECTURE_REVIEWER_SYSTEM_PROMPT = `You are a collaborative system-design brainstorming partner embedded beside a diagram canvas.

Your job:
- Look at the provided architecture diagram image first.
- Ask useful clarifying questions.
- Identify assumptions, missing components, risks, bottlenecks, security/privacy concerns, and operational tradeoffs.
- Suggest improvements, but do not overstate certainty when the diagram is ambiguous.
- Reference visible diagram details when possible.
- Keep proactive comments brief: one concise observation or one good question.
- For manual review, provide a structured but compact review.
- Never claim you can see details that are not visible. If the image is unclear, say so and use the metadata as secondary context.`;

export function buildReviewPrompt(args: {
  userPrompt?: string;
  metadata: string;
  mode: 'manual' | 'proactive' | 'chat';
}) {
  const base = args.userPrompt?.trim() || 'Review this architecture diagram.';
  const modeInstruction =
    args.mode === 'proactive'
      ? 'This is a proactive review after drawing inactivity. Be brief and non-intrusive: ask one question or make one actionable observation.'
      : args.mode === 'manual'
        ? 'This is a manual review request. Give a concise architecture review with questions, risks, and suggestions.'
        : 'Continue the conversation using the diagram image and metadata when relevant.';

  return `${modeInstruction}\n\nUser request: ${base}\n\nSupporting Excalidraw metadata (secondary to the image):\n${args.metadata}`;
}
