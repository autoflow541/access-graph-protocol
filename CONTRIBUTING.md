# Contributing to AGP

AGP is an experimental accessibility interoperability project. Contributions are welcome from disabled users, assistive-technology users and developers, accessibility specialists, web/platform engineers, robotics developers, standards practitioners, and researchers.

## Before proposing a new field

AGP should remain small. Prefer mapping an existing semantic concept before adding a new one.

A proposal should answer:

1. What interaction problem does this solve?
2. Can an existing ARIA, platform accessibility, Web of Things, Matter, or similar concept represent it already?
3. Does the proposed field expose meaning/capability rather than presentation?
4. What privacy or safety consequences does it create?
5. Can the proposal be demonstrated in at least two different technology domains?

## Development

Run tests with:

```bash
npm test
```

Run the browser demos with:

```bash
python -m http.server 8080
```

## Pull requests

Keep changes focused. For protocol changes, include an example and update the relevant schema or test. Breaking changes should explain migration impact.

## Accessibility feedback

Accessibility behavior should not be designed solely from automated checks. Issues based on lived experience and assistive-technology testing are especially valuable.

## Conduct

Be specific, technical, and respectful. Disagreement about architecture is expected; personal attacks and dismissing accessibility needs are not.
