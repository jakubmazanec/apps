export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  next?: DialogueNode<TContext, TNodeId> | TNodeId; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
};

export type DialogueNode<TContext, TNodeId extends string> = {
  speaker?: string; // name label; omitted = no label (signs, narration)
  portrait?: string; // game-resolved texture name; omitted = collapsed portrait panel
  // One page or several; a function is evaluated once on node entry, after onEnter.
  text: string[] | ((context: TContext) => string[] | string) | string;
  choices?: Array<DialogueChoice<TContext, TNodeId>>; // a node with both choices and next DEV-throws
  next?: DialogueNode<TContext, TNodeId> | TNodeId; // absent + no choices = dialogue ends
  onEnter?: (context: TContext) => void; // effects: set flags, give items
};

export type DialogueScript<TContext, TNodeId extends string> = {
  start:
    | DialogueNode<TContext, TNodeId>
    | TNodeId
    | ((context: TContext) => DialogueNode<TContext, TNodeId> | TNodeId);
  nodes?: Record<TNodeId, DialogueNode<TContext, TNodeId>>; // optional: inline-only scripts skip it
};

/**
 * Curried so the node record infers while the context type stays explicit (the
 * defineComponent/defineEvent precedent; there is no context value to infer
 * from). TNodeId's only inference site is the `nodes` keys; every reference
 * position is wrapped in NoInfer so a dangling id errors at the offending
 * literal instead of widening the union. There is no runtime graph validator;
 * the committed type fixtures in tests/dialogueScript.test.ts hold the
 * guarantee.
 */
export function defineDialogueScript<TContext>() {
  return function <TNodeId extends string>(script: {
    start:
      | DialogueNode<TContext, NoInfer<TNodeId>>
      | NoInfer<TNodeId>
      | ((context: TContext) => DialogueNode<TContext, NoInfer<TNodeId>> | NoInfer<TNodeId>);
    nodes?: Record<TNodeId, DialogueNode<TContext, NoInfer<TNodeId>>>;
  }): DialogueScript<TContext, TNodeId> {
    return script;
  };
}
