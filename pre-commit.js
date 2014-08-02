/**
 * Run this script before commiting to take care of some things:
 *  - Create readme table of contents
 */
"use strict";

var toc = require('marked-toc');


// run all pre-commit steps:
function preCommit() {
    generateReadmeToc();
}

// ######################################################
// pre-commit steps

/**
 * @see https://www.npmjs.org/package/marked-toc
 */
function generateReadmeToc() {
    toc.add('_README.md', 'README.md');
}


// run it!
preCommit();