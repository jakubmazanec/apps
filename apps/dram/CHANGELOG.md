# dram

## 0.5.1

### Patch Changes

- [#44](https://github.com/jakubmazanec/apps/pull/44)
  [`55011a1`](https://github.com/jakubmazanec/apps/commit/55011a11113f224da8eaa8310338956b4363c5aa)
  ([@renovate](https://github.com/apps/renovate)) – Applies templates from
  `@jakubmazanec/carson-templates` updated to version `^3.2.1`.

## 0.5.0

### Minor Changes

- [#35](https://github.com/jakubmazanec/apps/pull/35)
  [`e06a5b1`](https://github.com/jakubmazanec/apps/commit/e06a5b15d594f99862d36d7432b1f35c646627c2)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – DB schema was extended with object types for
  bottlings, bottles and tasting notes.

- [#35](https://github.com/jakubmazanec/apps/pull/35)
  [`e06a5b1`](https://github.com/jakubmazanec/apps/commit/e06a5b15d594f99862d36d7432b1f35c646627c2)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Adds support for searching (using `pg_trgm`),
  and sorting and filtering to the Notes page.

### Patch Changes

- [#39](https://github.com/jakubmazanec/apps/pull/39)
  [`71df8dd`](https://github.com/jakubmazanec/apps/commit/71df8dd22374e710afc1b687a28519f2b5f45800)
  ([@renovate](https://github.com/apps/renovate)) – Dependency `@jakubmazanec/carson-templates`
  updated to version `^3.1.3`.

- [#35](https://github.com/jakubmazanec/apps/pull/35)
  [`e06a5b1`](https://github.com/jakubmazanec/apps/commit/e06a5b15d594f99862d36d7432b1f35c646627c2)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Dependency `@jakubmazanec/ui` updated to
  version `^0.1.1`.

- [#43](https://github.com/jakubmazanec/apps/pull/43)
  [`f83bdfe`](https://github.com/jakubmazanec/apps/commit/f83bdfe1e1ef0fc917c35bea470ae7b4ba110dd0)
  ([@renovate](https://github.com/apps/renovate)) – Applies templates from
  `@jakubmazanec/carson-templates` updated to version `^3.2.0`.

- [#12](https://github.com/jakubmazanec/apps/pull/12)
  [`bcf8ac2`](https://github.com/jakubmazanec/apps/commit/bcf8ac263becc84da12b757a5d8a407c99b3127e)
  ([@renovate](https://github.com/apps/renovate)) – Dependency `typescript` updated to version
  `^5.7.2`.

- [#35](https://github.com/jakubmazanec/apps/pull/35)
  [`e06a5b1`](https://github.com/jakubmazanec/apps/commit/e06a5b15d594f99862d36d7432b1f35c646627c2)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Fixes access policies for User type in the DB
  schema.

## 0.4.1

### Patch Changes

- [`77a7fc5`](https://github.com/jakubmazanec/apps/commit/77a7fc5cf6acf60d42432c9a5c99e4f07581229b)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Squash migrations.

## 0.4.0

### Minor Changes

- [#31](https://github.com/jakubmazanec/apps/pull/31)
  [`e0dca06`](https://github.com/jakubmazanec/apps/commit/e0dca06834bd7a63e2eb5c778837f3fd3436ce7e)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Adds global variable `currentUserId` to the
  DB schema to allow simpler data import.

- [#31](https://github.com/jakubmazanec/apps/pull/31)
  [`e0dca06`](https://github.com/jakubmazanec/apps/commit/e0dca06834bd7a63e2eb5c778837f3fd3436ce7e)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Adds page "Notes" that displays paginated
  list of all user's notes.

### Patch Changes

- [#31](https://github.com/jakubmazanec/apps/pull/31)
  [`e0dca06`](https://github.com/jakubmazanec/apps/commit/e0dca06834bd7a63e2eb5c778837f3fd3436ce7e)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Fixes access policies, so users cannot see
  notes of other users.

- [#33](https://github.com/jakubmazanec/apps/pull/33)
  [`05b5274`](https://github.com/jakubmazanec/apps/commit/05b52744596c583d89bdec307de64118e3026501)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Fixes global variable `currentUser` in the DB
  schema.

- [#31](https://github.com/jakubmazanec/apps/pull/31)
  [`e0dca06`](https://github.com/jakubmazanec/apps/commit/e0dca06834bd7a63e2eb5c778837f3fd3436ce7e)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Updates UI library.

- [#31](https://github.com/jakubmazanec/apps/pull/31)
  [`e0dca06`](https://github.com/jakubmazanec/apps/commit/e0dca06834bd7a63e2eb5c778837f3fd3436ce7e)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Fixes how is a new user created after login.

## 0.3.0

### Minor Changes

- [#28](https://github.com/jakubmazanec/apps/pull/28)
  [`a52243c`](https://github.com/jakubmazanec/apps/commit/a52243cbc646dedafb510600aa2f0e0794c976a1)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Latest tasting notes are shown on the
  homepage.

- [#28](https://github.com/jakubmazanec/apps/pull/28)
  [`a52243c`](https://github.com/jakubmazanec/apps/commit/a52243cbc646dedafb510600aa2f0e0794c976a1)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – UI is created using `@jakubmazanec/ui`.

### Patch Changes

- [#28](https://github.com/jakubmazanec/apps/pull/28)
  [`a52243c`](https://github.com/jakubmazanec/apps/commit/a52243cbc646dedafb510600aa2f0e0794c976a1)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Fixes DB schema.

## 0.2.1

### Patch Changes

- [`acbdb22`](https://github.com/jakubmazanec/apps/commit/acbdb228451e99b7a004ccda6b4c2d8d43df4912)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Fixes Dram app URL.

## 0.2.0

### Minor Changes

- [#24](https://github.com/jakubmazanec/apps/pull/24)
  [`ca968dc`](https://github.com/jakubmazanec/apps/commit/ca968dc2e1574c656984ae5048a88296c9e47bf9)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Adds auth using EdgeDB auth.

### Patch Changes

- [#25](https://github.com/jakubmazanec/apps/pull/25)
  [`b493751`](https://github.com/jakubmazanec/apps/commit/b493751c18426d7f81c3586b49119e893235cead)
  ([@renovate](https://github.com/apps/renovate)) – Fixes Dockerfile.

## 0.1.0

### Minor Changes

- [#18](https://github.com/jakubmazanec/apps/pull/18)
  [`da127ad`](https://github.com/jakubmazanec/apps/commit/da127ad10851fde083e02a4844fb7abb0dcf3d1f)
  ([@jakubmazanec](https://github.com/jakubmazanec)) – Create app skeleton and basic DB schema.
