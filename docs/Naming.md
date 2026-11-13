[[_TOC_]]

Naming things is famously hard, but code with well-named identifiers is much easier to understand. Consider this page as guide that is - while not 100% prescriptive - the recommended way how to think about naming stuff (although some rules are enforced via linters). But feel free to initiate further discussions about this topic.

Although following suggestions and rules can generally be applied to any programming language (with few tweaks to take into account its idiosyncrasies), it is aimed primarily at JavaScript and TypeScript, with the latter used to illustrate the rules in practice.

We also briefly mention naming conventions for thing _other_ than the code itself, e.g. folder structure, repositories, etc.


# General rules

## English language

Use only English when naming your variables and functions. Since it’s the dominant language in programming, writing our code in English guarantees its cohesiveness.

```TypeScript
/* Bad */
const krestniJmeno = 'Gustav'
const pratele = ['Antonín', 'Petronela']

/* Good */
const firstName = 'Gustav'
const friends = ['Antonín', 'Petronela']
```


## Naming convention

We use `camelCase` for most identifiers (variables, functions, parameters, etc.), `PascalCase` for types, classes and related stuff and `SCREAMING_SNAKE_CASE` for constants.

These conventions are pretty straightforward (and in most cases are enforced by ESLint, so you don’t have to worry about them too much), but sometimes you may have one of following difficulties.

#### Lowercase initialisms in identifiers

How to treat initialisms in identifiers, e.g. the "XML" and "HTTP" when describing XML HTTP request, or HTML when describing some element? In our code, we prefer them lower-cased to ease typing, readability and ease of segmentation:

```TypeScript
/* Bad */
const newXMLHttpRequest = new XMLHttpRequest(/* ... */);
const parsedJSON = JSON.parse(/* ... */);
let clonedHTMLDivElement;

/* Good */
const newXmlHttpRequest = new XMLHttpRequest(/* ... */);
const parsedJson = JSON.parse(/* ... */);
let clonedHtmlDivElement;
```

### Don’t mindlessly copy other naming conventions

When using native or external APIs, we don’t have a choice but use its convention, but that doesn’t mean we have to propagate it to our own subsequent code:

```TypeScript
import { getUrlsConfiguration } from '@ori/configuration-manager-provider';

const urlsConfigurations = await getUrlsConfiguration(/* ... */);

/* Bad */
const IntranetUrl = urlsConfiguration.IntranetUrl; // Package is using C# naming convention because of an external API

/* Good */
const intranetUrl = urlsConfiguration.IntranetUrl;
```

> On the other hand, don’t force JavaScript/TypeScrip naming conventions onto other languages that we use while doing front-end development.

### Mind your word boundaries

Sometimes it may be difficult to decide what is considered as a word boundary. Just because some name is written with medial capitals, it doesn’t mean it consists of separate words regarding our naming convention, e.g. TypeScript or GraphQL:

```TypeScript
/* Bad */
const typeScriptSettings = {/* ... */};
const graphQLEndpoint = 'https://graphql-we-uat.oriflame.com/graphql';
const graphQlEndpoint = 'https://graphql-we-uat.oriflame.com/graphql';

/* Good */
const typescriptSettings = {/* ... */};
const graphqlEndpoint = 'https://graphql-we-uat.oriflame.com/graphql';
```

### No Hungarian notation

Don’t use any variations of [Hungarian notation](https://en.wikipedia.org/wiki/Hungarian_notation)! It is unnecessary, since there are context-aware code completion features available in all major editors and IDEs.


## S-I-D

A name must be _short_, _intuitive_ and _descriptive_:

- **Short**. A name must not take long to type and, therefore, remember;
- **Intuitive**. A name must read naturally, as close to the common speech as possible;
- **Descriptive**. A name must reflect what it does/possesses in the most efficient way.

```TypeScript
/* Bad */
const a = 5; // "a" could be anything
const isPaginatable = a > 10; // "Paginatable" sounds weird!
const shouldPaginatize = a > 10; // Made up verbs are so funny!

/* Good */
const postCount = 5;
const hasPagination = postCount > 10;
const shouldPaginate = postCount > 10;
```

Taken together, good name has high signal per word ratio.


## Avoid contractions

Do **not** use contractions. They only decrease readability of the code. Finding a short, descriptive name may be hard, but contraction is not an excuse for not doing so. And if you can’t find a short name, longer, but more descriptive name is ultimately better.

```TypeScript
/* Bad */
const onItmClk = () => {}

/* Good */
const onItemClick = () => {}
```

Common contractions that should be avoided: `err` instead of `error`, `req` instead of `request`, `prev` instead of `previous`, etc.

Exception to this rule is the name for the index variables or arguments:

```TypeScript
/* Ok */
const players = [/* ... */];

for (let i = 0; i < players.length; i++) {
  console.log(players[i].name);
}

/* Better with multiple arrays */
players.forEach((player, playerIndex) => {
  player.weapons.forEach((weapon, weaponIndex) => {
    /* ... */
  });
})
```


## Avoid context duplication

A name should not duplicate the context in which it is defined. Always remove the context from a name if that doesn’t severely decrease its readability.

```TypeScript
/* Bad */
class MenuItem {
  /* Method name duplicates the context (which is "MenuItem") */
  handleMenuItemClick = (event) => { ... }
}

const urls = {
  onlineUrl: /* ... */
  graphqlUrl: /* ... */
};

/* Good */
class MenuItem {
  /* Reads nicely as `MenuItem.handleClick()` */
  handleClick = (event) => { ... }
}

const urls = {
  online: /* ... */
  graphql: /* ... */
};
```

On the other hand, when you move a variable or a property out of some context, you should appropriately change their name:

```TypeScript
const urls = {
  online: /* ... */
  graphql: /* ... */
};

const onlineUrl = urls.online;
```


## Reflect the expected result

A name should reflect the expected result.

```TypeScriptx
/* Bad */
const isEnabled = itemCount > 3;
return <Button disabled={!isEnabled} />;

/* Good */
const isDisabled = itemCount <= 3;
return <Button disabled={isDisabled} />;
```


## Singular and plurals

Variable names can be made singular or plural depending on whether they hold a single value or multiple values.

```TypeScript
/* Bad */
const friends = 'Bob';
const friend = ['Bob', 'Tony', 'Tanya'];

/* Good */
const friend = 'Bob';
const friends = ['Bob', 'Tony', 'Tanya'];
```


# Naming functions

## A-HC-LC Pattern

There is a useful pattern to follow when naming functions:

```
prefix? + action (A) + high context (HC) + low context? (LC)
```

Take a look at how this pattern may be applied in the table below.

| Name                   | Prefix   | Action (A) | High context (HC) | Low context (LC) |
| ---------------------- | -------- | ---------- | ----------------- | ---------------- |
| `getUser`              |          | `get`      | `User`            |                  |
| `getUserMessages`      |          | `get`      | `User`            | `Messages`       |
| `handleClickOutside`   |          | `handle`   | `Click`           | `Outside`        |
| `shouldDisplayMessage` | `should` | `Display`  | `Message`         |                  |

> **Note:** The order of action and context affects the meaning of a variable. For example, `shouldUpdateComponent` means _you_ are about to update a component, while `shouldComponentUpdate` tells you that _component_ will update on itself, and you are but controlling when it should be updated.


## Actions

The verb part of your function name and the most important part responsible for describing what the function _does_. All functions should have action in their name.

### `get`

Accesses data immediately (i.e. shorthand getter of internal data).

```TypeScript
function getFruitCount() {
  return this.fruits.length;
}
```

> See also [compose](#compose).

### `set`

Sets a variable in a declarative way, with value `A` to value `B`.

```TypeScript
let fruits = 0;

function setFruits(nextFruits) {
  fruits = nextFruits;
}

setFruits(5);

console.log(fruits); // 5
```

### `reset`

Sets a variable back to its initial value or state.

```TypeScript
const initialFruits = 5;
let fruits = initialFruits;

setFruits(10);

console.log(fruits); // 10

function resetFruits() {
  fruits = initialFruits;
}

resetFruits();

console.log(fruits); // 5
```

### `fetch`

Request for some data, which takes some indeterminate time (i.e. async request).

```TypeScript
function fetchPosts(postCount) {
  return fetch('https://api.dev/posts', {...});
}
```

> If there are functions with complementing functionality (e.g. CRUD operations), `fetch` might not be the best verb.


### `create`

Creates something new.

```TypeScript
function createPost(post) {
  return database.create(post);
}
```

### `remove`

Removes something _from_ somewhere.

For example, if you have a collection of selected filters on a search page, removing one of them from the collection is `removeFilter`, **not** `deleteFilter` (and this is how you would naturally say it in English as well):

```TypeScript
function removeFilter(filterName, filters) {
  return filters.filter((name) => name !== filterName);
}

const selectedFilters = ['price', 'availability', 'size'];

removeFilter('price', selectedFilters);
```

> See also [delete](#delete).

### `delete`

Completely erases something from the realms of existence.

Imagine you are a content editor, and there is that notorious post you wish to get rid of. Once you clicked a shiny "Delete post" button, the CMS performed a `deletePost` action, **not** `removePost`.

```TypeScript
function deletePost(id) {
  return database.find({ id }).delete()
}
```

> See also [remove](#remove).

### `compose`

Creates new data from the existing one. Mostly applicable to strings, objects, or functions.

```TypeScript
function composePageUrl(pageName, pageId) {
  return (pageName.toLowerCase() + '-' + pageId)
}
```

> See also [get](#get).

### `handle`

Handles an action. Often used when naming a callback method.

```TypeScript
function handleLinkClick() {
  console.log('Clicked a link!')
}

link.addEventListener('click', handleLinkClick)
```


## Context

A domain that a function operates on.

A function is often an action on _something_. It is important to state what its operable domain is, or at least an expected data type.

```TypeScript
/* A pure function operating with primitives */
function filter(list, predicate) {
  return list.filter(predicate)
}

/* Function operating exactly on posts */
function getRecentPosts(posts) {
  return filter(posts, (post) => post.date === Date.now())
}
```

> Some language-specific assumptions may allow omitting the context. For example, in JavaScript, it’s common that `filter` operates on Array. Adding explicit `filterArray` would be unnecessary.


## Prefixes

Prefix enhances the meaning of a variable. It is rarely used in function names.

### `is`

Describes a characteristic or state of the current context (usually `boolean`).

```TypeScript
const color = 'blue'
const isBlue = color === 'blue' // characteristic
const isPresent = true // state

if (isBlue && isPresent) {
  console.log('Blue is present!')
}
```

### `has`

Describes whether the current context possesses a certain value or state (usually `boolean`).

```TypeScript
/* Bad */
const isProductsExist = productsCount > 0
const areProductsPresent = productsCount > 0

/* Good */
const hasProducts = productsCount > 0
```

### `should`

Reflects a positive conditional statement (usually `boolean`) coupled with a certain action.

```TypeScript
function shouldUpdateUrl(url, expectedUrl) {
  return url !== expectedUrl
}
```

### `minimum`/`maximum`

Represents a minimum or maximum value. Used when describing boundaries or limits.

```TypeScript
/**
 * Renders a random amount of posts within
 * the given minimum/maximum boundaries.
 */
function renderPosts(posts, minimumPosts, maximumPosts) {
  return posts.slice(0, randomBetween(minimumPosts, maximumPosts))
}
```

#### `previous`/`next`

Indicate the previous or the next state of a variable in the current context. Used when describing state transitions.

```TypeScriptx
function fetchPosts() {
  const previousPosts = this.state.posts

  const fetchedPosts = fetch('...')
  const nextPosts = concat(previousPosts, fetchedPosts)

  this.setState({ posts: nextPosts })
}
```


# Naming code-related things

## Files and directories

Files with source code should be generally named after its main/primary export, e.g.

```TypeScript
// file: Button.tsx

/* ... */

export const Button: React.FC<ButtonProps> = (props) => {
  /* ... */
};
```

Directories can also use kebab case, since it is also preferred naming convention for URLs.


##  Other stuff

- Git repositories should use kebab-case for their name.
- Git branches should use full names, not abbreviations: `development` (instead of `develop` or `dev`), `feature` (instead of `feat`), `release`, `main`.
- Names that are also used in URLs (such as app name, blob storage container name, etc.) should use kebab-case too.


# Sources

[kettanaito/naming-cheatsheet](https://github.com/kettanaito/naming-cheatsheet)
