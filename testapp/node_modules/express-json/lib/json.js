module.exports = function () {
    return function (req, res, next) {
        var json = res.json;
        res.json = function () {
            if (!req.headers.accept || req.headers.accept.indexOf('application/json') === -1) {
                res.contentType('text/plain');
            }
            json.apply(res, arguments);
        };
        next();
    };
};
