# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [3.1.4](https://github.com/maverick-js/observables/compare/v3.1.3...v3.1.4) (2022-07-03)


### Bug Fixes

* dont dispose of children on update ([a39679d](https://github.com/maverick-js/observables/commit/a39679d1ddb9b825a9e3fa8f33dc56f0bab18c43))

### [3.1.3](https://github.com/maverick-js/observables/compare/v3.1.2...v3.1.3) (2022-07-02)


### Bug Fixes

* additional parent tracking variable not required ([9df21ee](https://github.com/maverick-js/observables/commit/9df21ee0d104d1da85aa28ebebd7925c1995e56a))

### [3.1.2](https://github.com/maverick-js/observables/compare/v3.1.1...v3.1.2) (2022-07-02)


### Bug Fixes

* incorrect recursive parent tracking ([7390155](https://github.com/maverick-js/observables/commit/7390155f7a5e8be85c7d2fc8d06c4c261dc43437))

### [3.1.1](https://github.com/maverick-js/observables/compare/v3.1.0...v3.1.1) (2022-07-02)


### Bug Fixes

* parent should be determined on creation ([117fa5b](https://github.com/maverick-js/observables/commit/117fa5bc77dc84970f262801887238d3e5ead4c7))

## [3.1.0](https://github.com/maverick-js/observables/compare/v3.0.0...v3.1.0) (2022-07-01)


### Features

* `$observable` accepts dirty check option ([0c7a55d](https://github.com/maverick-js/observables/commit/0c7a55d9b71463200e90413a1d6987b00451e9ae))


### Bug Fixes

* effect should run all disposals on each new run ([3217217](https://github.com/maverick-js/observables/commit/3217217a85c232e6e0311d31ea3fd9d9b25db825))
* second argument to observables is an options object (prev debug id) ([d0c31e7](https://github.com/maverick-js/observables/commit/d0c31e745867283e190a6c1626c8156b624aeeda))

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

- `$root` ([a70746f](https://github.com/maverick-js/observables/commit/a70746ffbdf286452b8f0379f942faa5c9a37c38))
- `isObservable` ([88024da](https://github.com/maverick-js/observables/commit/88024dac825b548af6e40b78e618ec19d1e154d2))
- `onDispose` hook ([db8c142](https://github.com/maverick-js/observables/commit/db8c142625624f404fb021cc631a6cc8f5d44926))
- cleanup function can be returned inside `$effect` ([7a4f72f](https://github.com/maverick-js/observables/commit/7a4f72fac438010cae08d40244cd4e277995f8e6))
- improve type inference in `is` functions ([7cd7b92](https://github.com/maverick-js/observables/commit/7cd7b92eddce3cdaacb70100e6be021a89253e34))
- initial commit ([51cd6d5](https://github.com/maverick-js/observables/commit/51cd6d5cad05e3f1bb0f9446d29186b3b65e42b5))

### Bug Fixes

- `queueMicrotask` fallback will error ([0e0bea4](https://github.com/maverick-js/observables/commit/0e0bea4cfb13011cfdf121eb4c3279cb95459587)), closes [#2](https://github.com/maverick-js/observables/issues/2)
- rename `update()` to `next()` ([323f20e](https://github.com/maverick-js/observables/commit/323f20e8d491461dce873e999c6a4447274b9b7a))
