# Carson Templates: Docker Context for Workspace Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `workspace` Carson template whitelist the build inputs of non-app projects in the
Docker build context, so an app that depends on a workspace package can be built in its deploy
image.

**Architecture:** One template file changes, `templates/workspace/.dockerignore.ejs` in the
`@jakubmazanec/carson-templates` package of the `jakubmazanec/tools` repository. For every project
without `deployment.appName`, the `else` branch stops whitelisting `build/**` and whitelists
`source/**` and `tsconfig.json` instead; for projects created from `projects/react-library` it also
whitelists `.storybook/**`, `stories/**` and `vite.config.ts`, because that template's `build`
script ends with `storybook build`. A new vitest file renders the workspace template against a
temporary workspace holding one app, one library and one react-library project and asserts the exact
whitelist. The app `Dockerfile` template needs no change: its build stage already copies every
project's `package.json`, runs `npm ci --include=dev`, copies the context and runs
`npm run build -- --filter=<app>`, and its final stage already copies each non-app project's
`build/` and `package.json` and runs `npm ci --omit=dev`.

**Tech Stack:** EJS templates rendered by `@jakubmazanec/carson` 3.x, Node 24, npm 11, vitest 4,
TypeScript 6 (ESM, `module: node16`), Changesets.

**Spec:** Inline, see "Design" below. This plan was written in the `jakubmazanec/apps` repository,
where the gap was found while extracting the `tellurion` package from `apps/somewhere`; it is
executed in the `jakubmazanec/tools` repository.

## Design

**The gap.** The `workspace` template renders the root `.dockerignore` as "ignore everything, then
whitelist per project". For app projects (those with `deployment.appName` in `.carson/project.json`)
it whitelists `source/**`, `env.d.ts`, `package.json`, `public/**`, `react-router.config.ts`,
`tsconfig.json` and `vite.config.ts`. For every other project it whitelists only `build/**` and
`package.json` (plus `bin/**` when `package.json` has `bin`). The app `Dockerfile` template builds
with `npm run build -- --filter=<app>`. Turborepo honours `dependsOn: ["^build"]` under `--filter`,
so when the app depends on a workspace package the package's `build` script runs inside the image.
That script is `del-cli build tsconfig.tsbuildinfo && esbuild "source/**/*" … && tsc` (plus
`&& storybook build` for `projects/react-library`). It deletes the whitelisted `build/`, then finds
no `source/`, no `tsconfig.json` and no `.storybook/`, and the image build fails. No workspace using
these templates has had an app depend on an internal package before, so the path was never
exercised.

**The fix.** Whitelist what the package's `build` script reads instead of what it writes:

| Project kind                                        | Whitelisted today                             | Whitelisted after                                                  |
| --------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| app (`deployment.appName` set)                      | unchanged                                     | unchanged                                                          |
| any other project                                   | `build/**`, `package.json`, `bin/**` if `bin` | `source/**`, `tsconfig.json`, `package.json`, `bin/**` if `bin`    |
| other project created from `projects/react-library` | same as above                                 | the row above plus `.storybook/**`, `stories/**`, `vite.config.ts` |

`build/**` is dropped on purpose: the in-image build deletes it first, so carrying it in only ships
stale host output. Detection of react-library projects uses
`project.config.template.includes('projects/react-library')`, the same test
`templates/workspace/.github/workflows/release.yaml.ejs` already uses for the Chromatic deploy step.

**Alternative rejected.** Adding `--only` to the Dockerfile build line so the image reuses
host-built `build/` would also skip the app's own `codegen` dependency and would make a local
`npm run deploy` ship whatever `build/` is on disk. Building from source keeps the image
self-contained.

**Consequence for consumers.** A deploy image now builds every workspace package the app depends on,
including `storybook build` for react-library packages. `npm ci --include=dev` in the build stage
already installs those packages' devDependencies, because the Dockerfile copies every project's
`package.json` before installing.

## Global Constraints

- Repository: `jakubmazanec/tools`, default branch `development`. Branch from `development`; name
  the branch `carson-templates-docker-context`.
- Working directory for every command unless stated otherwise: `packages/carson-templates`.
- `npm install` at the repository root runs `prepare`, which builds `@jakubmazanec/carson` and
  `@jakubmazanec/carson-templates` and then runs `carson update workspace`. Run it once after
  cloning; the tests import the templates package through the workspace symlink, so `build/main.js`
  must exist. Template `.ejs` files are read from `templates/` directly and need no build.
- ESM everywhere: imports use the `node:` prefix for builtins and a `.js` extension for local files
  (`import {observableToPromise} from './observableToPromise.js'`).
- House style, enforced by `@jakubmazanec/eslint-config`: `let` for locals; a blank line before
  every `return`, `if` and around `let` groups; full-word identifiers (`workspacePath`, not
  `wsPath`); single quotes; trailing commas.
- Before each commit: `npx prettier --write <touched files>` then `npx eslint <touched files>`, both
  from `packages/carson-templates`, and fix every complaint.
- Commit messages: short imperative sentence, no conventional-commit prefix (repository style: "Fix
  dependencies", "Update TypeScript").
- Changeset for `@jakubmazanec/carson-templates` is `minor`, written in the changelog's voice:
  "Template `workspace` now …".
- Do not run the existing `tests/smoke-tests.test.ts` as part of the inner loop; it runs
  `npm install` in a temporary workspace and takes many minutes. CI runs it.

## Review Focus

1. A non-app project with a `bin` field keeps its `bin/**` whitelist after the change; the test
   gives the library project a `bin` and asserts the line (Task 1).
2. A non-app project no longer gets `build/**`, so stale host output cannot leak into the image; the
   test asserts the exact line list, which has no `build/**` line (Task 1).
3. Only react-library projects get the Storybook lines; the plain library project in the test must
   not get `.storybook/**`, `stories/**` or `vite.config.ts` (Task 1, exact list).
4. App project lines are unchanged; the exact list pins all seven app lines (Task 1).
5. A workspace with no app project renders no `.dockerignore` at all (front-matter `if`); unchanged
   by this work and asserted by Task 1's second test.

---

### Task 1: Failing test for the rendered `.dockerignore`

**Files:**

- Create: `packages/carson-templates/tests/dockerignore.test.ts`
- Read for reference: `packages/carson-templates/tests/smoke-tests.test.ts` (the create-workspace,
  create-project, update-workspace flow this test copies),
  `packages/carson-templates/tests/observableToPromise.ts`

**Interfaces:**

- Consumes: `runCreateWorkspace`, `runCreateProject`, `runUpdateWorkspace`, `Workspace` from
  `@jakubmazanec/carson`; `createTempDirectory` from `@jakubmazanec/fs-utils`; `observableToPromise`
  from `./observableToPromise.js`.
- Produces: nothing other tasks import; the test is the specification of Task 2's output.

- [ ] **Step 1: Write the failing test**

```ts
import {
  runCreateProject,
  runCreateWorkspace,
  runUpdateWorkspace,
  Workspace,
} from '@jakubmazanec/carson';
import {createTempDirectory} from '@jakubmazanec/fs-utils';
import fs from 'fs-extra';
import path from 'node:path';
import {afterEach, describe, expect, test, vitest} from 'vitest';

import {observableToPromise} from './observableToPromise.js';

vitest.setConfig({testTimeout: 120_000});

const WORKSPACE_TEMPLATE_ID = '@jakubmazanec/carson-templates:workspace';

type ProjectSpec = {
  name: string;
  relativePath: string;
  templateId: string;
};

const PROJECTS: ProjectSpec[] = [
  {
    name: 'web',
    relativePath: 'apps/web',
    templateId: '@jakubmazanec/carson-templates:projects/app',
  },
  {
    name: 'ui-kit',
    relativePath: 'packages/ui-kit',
    templateId: '@jakubmazanec/carson-templates:projects/react-library',
  },
  {
    name: 'utils',
    relativePath: 'packages/utils',
    templateId: '@jakubmazanec/carson-templates:projects/library',
  },
];

let workspacePath: string | undefined;

afterEach(async () => {
  if (workspacePath) {
    await fs.remove(workspacePath);
    workspacePath = undefined;
  }
});

async function createWorkspace() {
  workspacePath = await createTempDirectory('carson-templates-dockerignore-');

  await observableToPromise(
    runCreateWorkspace({
      args: {
        command: 'create workspace',
        errors: [],
        options: {path: workspacePath, template: WORKSPACE_TEMPLATE_ID},
        parameters: null,
        unknownOptions: null,
        rest: [],
      },
      templateId: WORKSPACE_TEMPLATE_ID,
      workspacePath,
    }),
  );

  return workspacePath;
}

async function createProjects(rootPath: string, projects: ProjectSpec[]) {
  let workspace = await Workspace.read(rootPath);

  for (let project of projects) {
    await observableToPromise(
      runCreateProject({
        args: {
          command: 'create project',
          errors: [],
          options: {name: project.name, path: rootPath, template: project.templateId},
          parameters: null,
          unknownOptions: null,
          rest: [],
        },
        templateId: project.templateId,
        projectPath: path.join(rootPath, project.relativePath),
        projectName: project.name,
        workspace,
      }),
    );
  }
}

async function patchJson(filePath: string, patch: (json: Record<string, unknown>) => void) {
  let json = (await fs.readJson(filePath)) as Record<string, unknown>;

  patch(json);

  await fs.writeJson(filePath, json, {spaces: 2});
}

async function updateWorkspace(rootPath: string) {
  // Re-read so config edits made on disk after project creation are seen.
  let workspace = await Workspace.read(rootPath);

  await observableToPromise(
    runUpdateWorkspace({
      args: {
        command: 'update workspace',
        errors: [],
        options: {path: rootPath},
        parameters: null,
        unknownOptions: null,
        rest: [],
      },
      workspace,
    }),
  );
}

async function readWhitelist(rootPath: string) {
  let content = await fs.readFile(path.join(rootPath, '.dockerignore'), {encoding: 'utf8'});

  return content
    .split('\n')
    .filter((line) => line.startsWith('!'))
    .filter((line) => line !== '!.npmrc');
}

describe('workspace template .dockerignore', () => {
  test('whitelists the build inputs of non-app projects', async () => {
    let rootPath = await createWorkspace();

    await createProjects(rootPath, PROJECTS);
    await patchJson(path.join(rootPath, 'apps/web/.carson/project.json'), (json) => {
      json.deployment = {appName: 'web'};
    });
    await patchJson(path.join(rootPath, 'packages/utils/package.json'), (json) => {
      json.bin = {utils: './bin/utils.js'};
    });
    await updateWorkspace(rootPath);

    expect(await readWhitelist(rootPath)).toEqual([
      '!/package-lock.json',
      '!/package.json',
      '!/patches/**',
      '!/turbo.json',
      '!apps/web/env.d.ts',
      '!apps/web/package.json',
      '!apps/web/public/**',
      '!apps/web/react-router.config.ts',
      '!apps/web/source/**',
      '!apps/web/tsconfig.json',
      '!apps/web/vite.config.ts',
      '!packages/ui-kit/.storybook/**',
      '!packages/ui-kit/package.json',
      '!packages/ui-kit/source/**',
      '!packages/ui-kit/stories/**',
      '!packages/ui-kit/tsconfig.json',
      '!packages/ui-kit/vite.config.ts',
      '!packages/utils/bin/**',
      '!packages/utils/package.json',
      '!packages/utils/source/**',
      '!packages/utils/tsconfig.json',
    ]);
  });

  test('renders no .dockerignore when no project is deployed as an app', async () => {
    let rootPath = await createWorkspace();

    await createProjects(rootPath, PROJECTS.slice(1));
    await updateWorkspace(rootPath);

    expect(await fs.pathExists(path.join(rootPath, '.dockerignore'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run, from `packages/carson-templates`: `npx vitest run tests/dockerignore.test.ts`

Expected: the first test FAILS on the `toEqual` assertion. The received array has
`!packages/ui-kit/build/**` and `!packages/utils/build/**` and lacks every `source/**`,
`tsconfig.json`, `.storybook/**`, `stories/**` and `vite.config.ts` line for the two packages. The
second test PASSES already (the front-matter `if` is existing behaviour). If the first test fails
for another reason, for example `Workspace.read` throwing because `build/main.js` is missing, run
`npm install` at the repository root first and retry.

- [ ] **Step 3: Format and lint the test**

Run: `npx prettier --write tests/dockerignore.test.ts && npx eslint tests/dockerignore.test.ts`

Expected: no output from eslint. Fix any complaint before continuing.

- [ ] **Step 4: Commit the failing test**

```bash
git add packages/carson-templates/tests/dockerignore.test.ts
git commit -m "Add test for Docker context whitelist of workspace packages"
```

### Task 2: Whitelist package build inputs in the template

**Files:**

- Modify: `packages/carson-templates/templates/workspace/.dockerignore.ejs` (the `else` branch
  inside the `for (let project of workspace.projects)` loop, currently three statements: push
  `build/**`, push `package.json`, push `bin/**` when `project.packageJson.bin`)
- Test: `packages/carson-templates/tests/dockerignore.test.ts` (from Task 1)

**Interfaces:**

- Consumes: `SOURCE_DIRECTORY` and `BUILD_DIRECTORY` globals exported by `source/constants.ts`
  (available to every template file); `project.config.template`, the template id string from
  `.carson/project.json`; `project.packageJson.bin`.
- Produces: the rendered `.dockerignore` lines asserted by Task 1.

- [ ] **Step 1: Replace the `else` branch**

Current branch:

```ejs
  } else {
    lines.push(`!${project.relativePath}/${BUILD_DIRECTORY}/**`);
    lines.push(`!${project.relativePath}/package.json`);

    if (project.packageJson.bin) {
      lines.push(`!${project.relativePath}/bin/**`);
    }
  }
```

New branch:

```ejs
  } else {
    // The app image runs `npm run build` for every workspace package the app depends on, so the
    // context must carry the package's build inputs, not its (deleted first) build output.
    lines.push(`!${project.relativePath}/${SOURCE_DIRECTORY}/**`);
    lines.push(`!${project.relativePath}/package.json`);
    lines.push(`!${project.relativePath}/tsconfig.json`);

    if (project.config.template?.includes('projects/react-library')) {
      // `storybook build` reads these.
      lines.push(`!${project.relativePath}/.storybook/**`);
      lines.push(`!${project.relativePath}/stories/**`);
      lines.push(`!${project.relativePath}/vite.config.ts`);
    }

    if (project.packageJson.bin) {
      lines.push(`!${project.relativePath}/bin/**`);
    }
  }
```

`BUILD_DIRECTORY` is no longer referenced in this file; that is expected. Keep the `lines.sort()`
call that follows the loop untouched, the test's expected order depends on it.

- [ ] **Step 2: Run the test to verify it passes**

Run, from `packages/carson-templates`: `npx vitest run tests/dockerignore.test.ts`

Expected: both tests PASS.

- [ ] **Step 3: Run the package's own checks**

Run, from `packages/carson-templates`: `npm run typecheck && npm run lint && npm run build`

Expected: all three exit 0. `build` is included because `prepare` builds this package for the tests
and the smoke test; a template-only change must not break it.

- [ ] **Step 4: Format and commit**

```bash
npx prettier --write templates/workspace/.dockerignore.ejs
git add packages/carson-templates/templates/workspace/.dockerignore.ejs
git commit -m "Include workspace package build inputs in Docker context"
```

If prettier reports the `.ejs` file as an unknown type, that is fine; commit the file as written.

### Task 3: Changeset

**Files:**

- Create: `.changeset/docker-context-workspace-packages.md` (repository root)

- [ ] **Step 1: Write the changeset**

```md
---
'@jakubmazanec/carson-templates': minor
---

Template `workspace` now includes the build inputs of non-app projects in the Docker build context:
`source/`, `tsconfig.json` and `package.json`, plus `.storybook/`, `stories/` and `vite.config.ts`
for projects created from `projects/react-library`. Their `build/` output is no longer included,
because the app image rebuilds every workspace package the app depends on. This lets an app depend
on a workspace package and still deploy.
```

- [ ] **Step 2: Verify Changesets accepts it**

Run, from the repository root: `npx changeset status --since=origin/development`

Expected: it lists `@jakubmazanec/carson-templates` with a minor bump and exits 0.

- [ ] **Step 3: Commit**

```bash
git add .changeset/docker-context-workspace-packages.md
git commit -m "Add changeset"
```

### Task 4: Release and propagate to the `apps` repository

**Files:**

- None edited by hand in `tools`; CI edits `CHANGELOG.md`, `package.json` versions and the lockfile.
- In `jakubmazanec/apps`: `package.json` (devDependency bump, by Renovate), `.dockerignore`
  (regenerated by Carson), `.changeset/*` (generated by the `update-pull-request` workflow).

- [ ] **Step 1: Open the pull request**

```bash
git push -u origin carson-templates-docker-context
gh pr create --base development --title "Include workspace package build inputs in Docker context" --body "Fixes the workspace template's .dockerignore so an app that depends on a workspace package can be built in its deploy image. See the plan in jakubmazanec/apps docs/superpowers/plans/2026-10-02-carson-templates-docker-context.md."
```

Expected: the "Check pull request" workflow passes, including the smoke test that creates a
workspace with all three project templates and builds it.

- [ ] **Step 2: Merge and release**

Merge the PR into `development`. Run the "Merge development branch to main branch" workflow
(`workflow_dispatch`); it merges into `main` and triggers "Release", which publishes
`@jakubmazanec/carson-templates@9.1.0` to npm and merges `main` back into `development`.

- [ ] **Step 3: Propagate to `jakubmazanec/apps`**

Renovate opens a PR on `development` in `apps` bumping `@jakubmazanec/carson-templates` to `^9.1.0`;
the `update-pull-request` workflow adds the dependency changeset and re-runs `npm install`, which
regenerates `.dockerignore`. Merge it. Then, on the `somewhere-update` branch:

```bash
git merge development
npm install
git status
```

Expected: `git status` is clean after `npm install` (Carson's `prepare` hook already produced the
regenerated `.dockerignore` on `development`). Once the `tellurion` package exists on the branch,
`.dockerignore` contains `!packages/tellurion/.storybook/**`, `!packages/tellurion/package.json`,
`!packages/tellurion/source/**`, `!packages/tellurion/stories/**`,
`!packages/tellurion/tsconfig.json` and `!packages/tellurion/vite.config.ts`.

- [ ] **Step 4: Prove the image builds (optional, needs Docker)**

From the `apps` repository root, after the `tellurion` package exists:

```bash
docker build -f apps/somewhere/Dockerfile --build-arg VITE_APP_URL=http://localhost:5000 -t somewhere-image-check .
```

Expected: the build stage runs `tellurion#build` (esbuild, tsc, storybook build) and then
`somewhere#build`, and the final image is produced. This is the same build Fly runs on deploy.
