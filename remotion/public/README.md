# remotion/public/

Static files the compositions reference with `staticFile()`.

Put your logo here and name it in the `EndCard` defaultProps in
`remotion/src/Root.tsx`:

```tsx
defaultProps={{ mark: "mark.svg", title: "Acme", ... }}
```

SVG or PNG. It renders at 72×72, so an icon mark works better than a full
wordmark.
