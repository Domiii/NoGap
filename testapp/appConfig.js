module.exports = {
    "dev": "1",

    "httpd": {
        "port"     : "12345",
        "wikiUrl"  : "http://localhost:80/wiki"
    },

    "session" : {
        // For more information, read: http://blog.teamtreehouse.com/how-to-create-totally-secure-cookies
        // session persists for two weeks:
        "lifetime" : 1000 * 60 * 60 * 24 * 14,
        
        // make sure to set the domain to disable sub-domains from getting your cookies!
        // domain can include the port
        // TODO: Support multiple domains
        "domain"   : undefined,
        
        // If there are multiple websites on the same domain, specify which part of the path is dedicated for this application
        "path"     : '/'
    },

    "logging" : {
        defaultFile: 'log/app.log',
    },

    "components": {
        "baseFolder"   : "components",
        "publicFolder" : "pub",
        "files"        : [
            // list all components here:
            "Main.js",
            "Home.js",
            "Guest.js",
        ]
    },
};