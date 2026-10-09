/** Where a dialogue goes: a node, an id or a function of the context that returns either. */
export type DialogueReference<TContext, TNodeId extends string> =
  | DialogueNode<TContext, TNodeId>
  | TNodeId
  | ((context: TContext) => DialogueNode<TContext, TNodeId> | TNodeId);

export type DialogueChoice<TContext, TNodeId extends string> = {
  text: string;
  // A function is evaluated with the context each time the choice is taken, after onChoose.
  next?: DialogueReference<TContext, TNodeId>; // absent = choosing ends the dialogue
  isVisible?: (context: TContext) => boolean; // evaluated once on node entry
  onChoose?: (context: TContext) => void; // effects; runs when taken, before next is followed
};

export type DialogueNode<TContext, TNodeId extends string> = {
  speaker?: string; // name label; omitted = no label (signs, narration)
  portrait?: string; // game-resolved texture name; omitted = collapsed portrait panel
  // One page or several; a function is evaluated once on node entry, after onEnter.
  text: string[] | ((context: TContext) => string[] | string) | string;
  choices?: Array<DialogueChoice<TContext, TNodeId>>; // a node with both choices and next DEV-throws
  // A function is evaluated with the context each time the last page is advanced past.
  next?: DialogueReference<TContext, TNodeId>; // absent + no choices = dialogue ends
  onEnter?: (context: TContext) => void; // effects: set flags, give items
};

export type DialogueScript<TContext, TNodeId extends string> = {
  start: DialogueReference<TContext, TNodeId>;
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
