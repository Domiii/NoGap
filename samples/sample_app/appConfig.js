module.exports = {
    "httpd": {
        "port"     : "1234",
        "wikiUrl"  : "http://localhost:80/wiki"
    },

    "nogap": {
        "baseFolder"   : "components",
        "publicFolder" : "pub",
        "files"        : [
            // list all components here:

            // utilities
            "ValidationUtil.js",

            // pages for guests
            "Guest.js",

            // pages for users
            "Main.js",
            "Home.js"
        ]
    },

    // files + style for logging
    "logging" : {
        defaultFile: 'log/app.log',
    },
};