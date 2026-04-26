# FaceFilter react fiber demo


## Presentation

This directory is fully standalone, that's why it is not in the [/demos](/demos) path like other demonstrations.


## Quick start

To test it, run from this path:

```bash
# facultative: use Node >= 22:
nvm use 22
#
npm install
npm run dev -- --host
```

Then open https://localhost:5173/ in your web browser.


## Production build

```bash
npm run build
```


## Dev notes

THREE.js is used through [Three Fiber](https://github.com/pmndrs/react-three-fiber). This is only a boilerplate, displaying a simple mesh. It also handles screen resizing / orientation change.

Jeeliz FaceFilter is used through the [NPM facefilter package](https://www.npmjs.com/package/facefilter).