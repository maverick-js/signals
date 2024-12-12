import type { Computed } from './computed';
import type { Effect } from './effect';
import type { Node } from './node';

export type Reaction = Computed | Effect;

export function isReactionNode(node: Node): node is Reaction {
  if (__DEV__) {
    return '_compute' in node;
  } else {
    return 'ƒ' in node;
  }
}
