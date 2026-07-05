// Marp CLI config for the Course 2 deck.
//
// If a slide ever needs a markdown extension the theme CSS cannot express,
// extend the engine here instead of forking Marp:
//
//   const { Marp } = require('@marp-team/marp-core')
//   module.exports = {
//     engine: (opts) => new Marp(opts).use(require('markdown-it-something')),
//     ...
//   }
//
/** @type {import('@marp-team/marp-cli').Config} */
module.exports = {
  themeSet: './themes',
  html: true, // the theme's utility blocks (.cols / .capsule / .chip) are plain HTML
  allowLocalFiles: true, // local fonts + assets/bg/ backgrounds in exports
}
