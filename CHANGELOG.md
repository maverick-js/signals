# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [4.9.1](https://github.com/maverick-js/observables/compare/v4.9.0...v4.9.1) (2022-11-25)


### Bug Fixes

* general error handling improvements ([3b7095f](https://github.com/maverick-js/observables/commit/3b7095f8cbde680f8dce00e959f40b021535c2d3))

## [4.9.0](https://github.com/maverick-js/observables/compare/v4.8.5...v4.9.0) (2022-11-25)


### Features

* new `ObservableOptions` type export ([e6aa68c](https://github.com/maverick-js/observables/commit/e6aa68c1459566ba3783ce08ff3c65cb1b42d904))


### Bug Fixes

* auto-dispose computed if no observers ([0ab5855](https://github.com/maverick-js/observables/commit/0ab5855eb27dfcbe4fd5f5290fe725f6d0d76ebf))
* only dispose needed parts ([a3db078](https://github.com/maverick-js/observables/commit/a3db078c366b7e4f4350f09cbd06b309ccd10953))
* remove child from parent set on dispose ([4fcbaec](https://github.com/maverick-js/observables/commit/4fcbaec39dd37cd5cfb8df17d56b065c9ffd01c3))
* stop observing computed after its disposed ([c2daca8](https://github.com/maverick-js/observables/commit/c2daca8ae29bdae7de08b815626eb7233283b8dd))

### [4.8.5](https://github.com/maverick-js/observables/compare/v4.8.4...v4.8.5) (2022-11-16)


### Bug Fixes

* consistent empty disposals order ([3459a1a](https://github.com/maverick-js/observables/commit/3459a1a49bb9addaed4898fa4ad63d9b0c4ad622))
* simplify effect child disposal ([0feced4](https://github.com/maverick-js/observables/commit/0feced47e9ee68df7709f17d3ada3245d9205bc1))

### [4.8.4](https://github.com/maverick-js/observables/compare/v4.8.3...v4.8.4) (2022-11-15)


### Bug Fixes

* `getParent` -> `getScope` ([adabf61](https://github.com/maverick-js/observables/commit/adabf61885853dc6489ced8df52c00b793f71b7b))
* dispose conditional nested effects ([f06756c](https://github.com/maverick-js/observables/commit/f06756c7500c8e1306a1c094011a5f3cd6a912ef))

### [4.8.3](https://github.com/maverick-js/observables/compare/v4.8.2...v4.8.3) (2022-11-08)


### Bug Fixes

* scoped function should still be observable ([0c1d2ea](https://github.com/maverick-js/observables/commit/0c1d2ea334db68cb22e91a8571b35867ab0cbeb3))

### [4.8.2](https://github.com/maverick-js/observables/compare/v4.8.1...v4.8.2) (2022-11-08)


### Bug Fixes

* add context symbol description in dev ([96ea827](https://github.com/maverick-js/observables/commit/96ea827d88a9f1d9009ae64b832d2ddb426ef891))

### [4.8.1](https://github.com/maverick-js/observables/compare/v4.8.0...v4.8.1) (2022-11-08)


### Bug Fixes

* add symbol descriptions in dev ([298410a](https://github.com/maverick-js/observables/commit/298410a1651e57c68ac63854d19e85476bbdc7d0))

## [4.8.0](https://github.com/maverick-js/observables/compare/v4.7.1...v4.8.0) (2022-11-08)


### Features

* `scope` accepts parent arg ([4eb2760](https://github.com/maverick-js/observables/commit/4eb276005c8d21c2d1d7fedc6cac2b04f26a2bf6))

### [4.7.1](https://github.com/maverick-js/observables/compare/v4.7.0...v4.7.1) (2022-11-04)


### Bug Fixes

* scoped function can return value ([c1d13c8](https://github.com/maverick-js/observables/commit/c1d13c85590fb7e52e2d1acbca25af72d89840c8))

## [4.7.0](https://github.com/maverick-js/observables/compare/v4.6.0...v4.7.0) (2022-11-04)


### Features

* new `scope` export ([806e82a](https://github.com/maverick-js/observables/commit/806e82ac932cca7fdf822333318b8954d415a693))

## [4.6.0](https://github.com/maverick-js/observables/compare/v4.5.0...v4.6.0) (2022-10-28)


### Features

* new `isObserved` export ([1bf4cd1](https://github.com/maverick-js/observables/commit/1bf4cd1057e768de9a2f7646ed5232aa7905699b))


### Bug Fixes

* dispose cells at the end of each cellx benchmark run ([9c63d4b](https://github.com/maverick-js/observables/commit/9c63d4b83b2fe82868281a120d65cf63e6fbf15a))
* fix sinuous benchmarks ([f55e188](https://github.com/maverick-js/observables/commit/f55e1881eb01f93aa8762f6118774c98be426da1))
* let cellx release its global pendingCells array between benchmarks ([0a02af1](https://github.com/maverick-js/observables/commit/0a02af19b6e966404ed0f134dde578e52fa27b14))

## [4.5.0](https://github.com/maverick-js/observables/compare/v4.4.0...v4.5.0) (2022-08-30)


### Features

* bump scheduler to `2.0.0` ([58cf305](https://github.com/maverick-js/observables/commit/58cf305a030d7b61ce38c8d1038e7c2bbb21bb95))

## [4.4.0](https://github.com/maverick-js/observables/compare/v4.3.2...v4.4.0) (2022-08-30)


### Features

* bump scheduler to `1.0.2` ([b35f3bb](https://github.com/maverick-js/observables/commit/b35f3bb134c4c5bb2def73af0580db299c152491))

### [4.3.2](https://github.com/maverick-js/observables/compare/v4.3.1...v4.3.2) (2022-08-10)


### Bug Fixes

* use set so error handlers are only added once ([68c75ab](https://github.com/maverick-js/observables/commit/68c75ab0f7a1a8661592183d4c947600c3231b37))

### [4.3.1](https://github.com/maverick-js/observables/compare/v4.3.0...v4.3.1) (2022-08-09)


### Bug Fixes

* forward error re-throw to parent handler ([5034795](https://github.com/maverick-js/observables/commit/50347954e37314f72f84661aebebcbe649c4e899))

## [4.3.0](https://github.com/maverick-js/observables/compare/v4.2.3...v4.3.0) (2022-08-09)


### Features

* `getContext` and `setContext` ([9578cd0](https://github.com/maverick-js/observables/commit/9578cd0b7a62b0838f03a0987094cb90bd254300))
* `onError` ([f36c1c0](https://github.com/maverick-js/observables/commit/f36c1c017061d4c20d61415bd1c74cc70da0018b))


### Bug Fixes

* exclude `@maverick-js/scheduler` from bundle (external) ([2f37a04](https://github.com/maverick-js/observables/commit/2f37a0448a2f62fe52f23bfc936c11fbb60ef338))

### [4.2.3](https://github.com/maverick-js/observables/compare/v4.2.2...v4.2.3) (2022-08-09)


### Bug Fixes

* `root` should keep a reference to parent ([d8162ae](https://github.com/maverick-js/observables/commit/d8162ae8f5a20a14d00f0fb826219f2e5f911cd5))

### [4.2.2](https://github.com/maverick-js/observables/compare/v4.2.1...v4.2.2) (2022-08-09)


### Bug Fixes

* prevent infinite `getParent` recursion (attempt 2) ([b600c7a](https://github.com/maverick-js/observables/commit/b600c7ac6bb0d68c9ad9a08c1f161c0a8dfdf270))

### [4.2.1](https://github.com/maverick-js/observables/compare/v4.2.0...v4.2.1) (2022-08-09)


### Bug Fixes

* prevent infinite recursion when nesting `getParent` calls ([68d850d](https://github.com/maverick-js/observables/commit/68d850dfbaeeb922bce86739f35c17bbdc3ddd83))

## [4.2.0](https://github.com/maverick-js/observables/compare/v4.1.2...v4.2.0) (2022-08-09)


### Features

* argumentless `getParent()` returns current parent ([c717439](https://github.com/maverick-js/observables/commit/c717439932a64e1c8ec6363c16b6a6aca2ce6021))

### [4.1.2](https://github.com/maverick-js/observables/compare/v4.1.1...v4.1.2) (2022-08-08)


### Bug Fixes

* remove redundant `unrefSet` calls ([778b8ee](https://github.com/maverick-js/observables/commit/778b8ee360d9c4ce3174f5d8d779b54bd96e1478))

### [4.1.1](https://github.com/maverick-js/observables/compare/v4.1.0...v4.1.1) (2022-08-08)


### Bug Fixes

* update computed map docs ([0bbf814](https://github.com/maverick-js/observables/commit/0bbf8149ce52ae3ffe4f790675dc00b4d72e0b2c))

## [4.1.0](https://github.com/maverick-js/observables/compare/v4.0.2...v4.1.0) (2022-08-08)


### Features

* `computedMap` and `computedKeyedMap` ([4e9c91b](https://github.com/maverick-js/observables/commit/4e9c91b63e1ae9ab85c650553849c8b5a3d10ad1))

### [4.0.2](https://github.com/maverick-js/observables/compare/v4.0.1...v4.0.2) (2022-08-05)


### Bug Fixes

* do not empty disposal on non-dirty child computations ([86b2d75](https://github.com/maverick-js/observables/commit/86b2d75075b7c494636bf1127d3776bdc2989682))

### [4.0.1](https://github.com/maverick-js/observables/compare/v4.0.0...v4.0.1) (2022-08-05)


### Bug Fixes

* keep child computations alive on update ([f4b1d2d](https://github.com/maverick-js/observables/commit/f4b1d2d6651da0692fdb77c8ac30c6a803710b9e)), closes [#4](https://github.com/maverick-js/observables/issues/4)

## [4.0.0](https://github.com/maverick-js/observables/compare/v3.4.1...v4.0.0) (2022-08-04)

### ⚠ BREAKING CHANGES

- Library authors can decide how to re-export bindings
  from this package. The `$` prefix was used a little inconsistently so
  it's best to drop it completely.

### Bug Fixes

- drop `$` prefix on exports ([a18149b](https://github.com/maverick-js/observables/commit/a18149b929d7471f5d00597674aa1f0e5728c11a)), see [#4](https://github.com/maverick-js/observables/issues/4#issuecomment-1171106602)

### [3.4.1](https://github.com/maverick-js/observables/compare/v3.4.0...v3.4.1) (2022-07-12)

### Bug Fixes

- move scheduler to separate package ([83120d7](https://github.com/maverick-js/observables/commit/83120d7662daaf5e7ac2fe0ac0cceda26f80f1c5))

## [3.4.0](https://github.com/maverick-js/observables/compare/v3.3.0...v3.4.0) (2022-07-08)

### Features

- new `dirty` option for `computed` ([7ae2e6c](https://github.com/maverick-js/observables/commit/7ae2e6cb353d571e66a56c8c90ddc2e35fe126d9))

## [3.3.0](https://github.com/maverick-js/observables/compare/v3.2.0...v3.3.0) (2022-07-08)

### Features

- new export `getParent` ([88310aa](https://github.com/maverick-js/observables/commit/88310aadf829b984011b9fc108997701d767c8e2))

### Bug Fixes

- track parent across peeks ([af4d561](https://github.com/maverick-js/observables/commit/af4d5615d78560f75ecea780a15ee46c33049719))

## [3.2.0](https://github.com/maverick-js/observables/compare/v3.1.5...v3.2.0) (2022-07-06)

### Features

- new `onFlush` method on scheduler ([0eccb59](https://github.com/maverick-js/observables/commit/0eccb59d1781795df358d99b8d1ffb99010fd1b4))
- new export `getScheduler` ([f92183b](https://github.com/maverick-js/observables/commit/f92183bcfa8c0959c0eb68b0f3efb24087a87e08))

### [3.1.5](https://github.com/maverick-js/observables/compare/v3.1.4...v3.1.5) (2022-07-03)

### Bug Fixes

- revert a39679d1ddb9b825a9e3fa8f33dc56f0bab18c43 ([88c5dbe](https://github.com/maverick-js/observables/commit/88c5dbe26c312c86c1663a71562ea1bfe1a0fad5))

### [3.1.4](https://github.com/maverick-js/observables/compare/v3.1.3...v3.1.4) (2022-07-03)

### Bug Fixes

- dont dispose of children on update ([a39679d](https://github.com/maverick-js/observables/commit/a39679d1ddb9b825a9e3fa8f33dc56f0bab18c43))

### [3.1.3](https://github.com/maverick-js/observables/compare/v3.1.2...v3.1.3) (2022-07-02)

### Bug Fixes

- additional parent tracking variable not required ([9df21ee](https://github.com/maverick-js/observables/commit/9df21ee0d104d1da85aa28ebebd7925c1995e56a))

### [3.1.2](https://github.com/maverick-js/observables/compare/v3.1.1...v3.1.2) (2022-07-02)

### Bug Fixes

- incorrect recursive parent tracking ([7390155](https://github.com/maverick-js/observables/commit/7390155f7a5e8be85c7d2fc8d06c4c261dc43437))

### [3.1.1](https://github.com/maverick-js/observables/compare/v3.1.0...v3.1.1) (2022-07-02)

### Bug Fixes

- parent should be determined on creation ([117fa5b](https://github.com/maverick-js/observables/commit/117fa5bc77dc84970f262801887238d3e5ead4c7))

## [3.1.0](https://github.com/maverick-js/observables/compare/v3.0.0...v3.1.0) (2022-07-01)

### Features

- `observable` accepts dirty check option ([0c7a55d](https://github.com/maverick-js/observables/commit/0c7a55d9b71463200e90413a1d6987b00451e9ae))

### Bug Fixes

- effect should run all disposals on each new run ([3217217](https://github.com/maverick-js/observables/commit/3217217a85c232e6e0311d31ea3fd9d9b25db825))
- second argument to observables is an options object (prev debug id) ([d0c31e7](https://github.com/maverick-js/observables/commit/d0c31e745867283e190a6c1626c8156b624aeeda))

## [3.0.0](https://github.com/maverick-js/observables/compare/v2.0.3...v3.0.0) (2022-06-30)

### ⚠ BREAKING CHANGES

- computed type `Computed` -> `Observable`
- observable return type is now `ObservableSubject`
- dropped `isComputed`
- `isObservable` checks readonly
- `isObservable` passes for computed observables

### Bug Fixes

- all types extend observable ([bef215c](https://github.com/maverick-js/observables/commit/bef215c1ec98cb3593e1f9daea71bb6b6974ee2f))

### [2.0.3](https://github.com/maverick-js/observables/compare/v2.0.2...v2.0.3) (2022-06-28)

### Bug Fixes

- track parent separately to handle disposals correctly ([50110d4](https://github.com/maverick-js/observables/commit/50110d4d8fa590310a24d3e9b4433463c455c189))

### [2.0.2](https://github.com/maverick-js/observables/compare/v2.0.1...v2.0.2) (2022-06-27)

### Bug Fixes

- dont need safe inequality check ([368af0c](https://github.com/maverick-js/observables/commit/368af0ccc594654defe619763935376abbdfb56c))

### [2.0.1](https://github.com/maverick-js/observables/compare/v2.0.0...v2.0.1) (2022-06-27)

### Bug Fixes

- avoid stack overflow in prod ([4cba856](https://github.com/maverick-js/observables/commit/4cba85621a693a8b3afb6f2a0fe663ec06384d31))

## 2.0.0 (2022-06-27)

### Features

- `root` ([a70746f](https://github.com/maverick-js/observables/commit/a70746ffbdf286452b8f0379f942faa5c9a37c38))
- `isObservable` ([88024da](https://github.com/maverick-js/observables/commit/88024dac825b548af6e40b78e618ec19d1e154d2))
- `onDispose` hook ([db8c142](https://github.com/maverick-js/observables/commit/db8c142625624f404fb021cc631a6cc8f5d44926))
- cleanup function can be returned inside `effect` ([7a4f72f](https://github.com/maverick-js/observables/commit/7a4f72fac438010cae08d40244cd4e277995f8e6))
- improve type inference in `is` functions ([7cd7b92](https://github.com/maverick-js/observables/commit/7cd7b92eddce3cdaacb70100e6be021a89253e34))
- initial commit ([51cd6d5](https://github.com/maverick-js/observables/commit/51cd6d5cad05e3f1bb0f9446d29186b3b65e42b5))

### Bug Fixes

- `queueMicrotask` fallback will error ([0e0bea4](https://github.com/maverick-js/observables/commit/0e0bea4cfb13011cfdf121eb4c3279cb95459587)), closes [#2](https://github.com/maverick-js/observables/issues/2)
- rename `update()` to `next()` ([323f20e](https://github.com/maverick-js/observables/commit/323f20e8d491461dce873e999c6a4447274b9b7a))
