import { getScope, observable, root, untrack } from '../src';
import { CHILDREN, SCOPE } from '../src/symbols';

it('should not track scope', () => {
  root(() => {
    untrack(() => {
      const $a = observable(0);
      expect($a[SCOPE]).toBeNull();
    });

    expect(getScope()![CHILDREN]).toBeNull();
  });
});
