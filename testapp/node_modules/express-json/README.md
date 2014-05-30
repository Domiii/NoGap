# express-json

A middleware for [Express](https://github.com/visionmedia/express)
that sets `Content-Type` to `text/plain` if `Accept` header doesn't
contain `application/json`.

## Installation

```bash
$ npm install express-json
```

## Usage

```js
var express = require('express'),
    json = require('express-json');

var app = express()
  .use(json())
  .use(function (req, res) {
    res.json({
        helloWorld: 'Hello World!'
    });
  })
  .listen(3000);
```
