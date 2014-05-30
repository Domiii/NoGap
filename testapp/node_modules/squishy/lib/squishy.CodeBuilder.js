/**
 *
 */
"use strict";

var StacktraceBuilder = require('./squishy.Stacktrace');


/**
 * Provides tools to convert JS code to strings and back.
 */
var CodeBuilder = {
    /**
     * Fix quotation marks and new-lines.
     */
    escapeCode: function(codeStr) {
        // TODO: Avoid double-escaping of quotation marks inside of strings.
        return '\'' + codeStr.replace(/'/g, '\\\'').replace(/\r?\n|\r/g, '\\n') + '\'';
    },
    
    prettyFileNameUrl: function(fname) {
        // TODO: Use encodeURIComponent to make sure that fname is a valid URL
        return fname.replace(/\\/g, '/');
    },

    /** 
     * Annotates a string of code, so that the stacktrace contains a meaningful filename when eval'ed.
     * Make sure that name has the format of an URL (must not contain whitespace, etc...).
     *
     * @see http://blog.getfirebug.com/2009/08/11/give-your-eval-a-name-with-sourceurl/
     */
    nameCode: function(codeString, name) {
        return codeString + "\n//@ sourceURL=" + encodeURIComponent(name);
    },
    

    /**
     * Make sure that the function declaration is tightly wrapped by `serializeInlineFunction`.
     * Do NOT add additional spaces or new lines between `serializeInlineFunction(` and `function`!
     * Do NOT declare the function elsewhere and then hand it to `serializeInlineFunction`.
     * Declare it like this: StacktraceBuilder.serializeInlineFunction(function(...) { ...
     */
    serializeInlineFunctionCall: function(fun, args) {
        var trace = StacktraceBuilder.getStacktrace();
        var creationFrame = trace[1];
        
        // use heuristics to determine correct column of first line
        creationFrame.column += 'serializeInlineFunction'.length;
        
        var serializedFunction = this.serializeFunction(fun, creationFrame);
        return this.buildFunctionCall(serializedFunction, args);
    },
    
    buildFunctionCall: function(serializedFunction, args) {
        return '(' + serializedFunction + ')(' + squishy.objToString(args) + ');\n\n';
    },

    /**
     * Make sure that the function declaration is tightly wrapped by `serializeInlineFunction`.
     * Do NOT add additional spaces or new lines between `serializeInlineFunction(` and `function`!
     * Do NOT declare the function elsewhere and then hand it to `serializeInlineFunction`.
     * Declare it like this: StacktraceBuilder.serializeInlineFunction(function(...) { ...
     */
    serializeInlineFunction: function(fun) {
        var trace = StacktraceBuilder.getStacktrace();
        var creationFrame = trace[1];
        
        // use heuristics to determine correct column of first line
        creationFrame.column += 'serializeInlineFunction'.length;
        
        return this.serializeFunction(fun, creationFrame);
    },
    
    /**
     * Modifies string version of given function so that it's stacktrace will be correct when eval'ed.
     * The accuracy depends on the reliability of the stack frame information of where and when the function was defined.
     * @see http://jsfiddle.net/5CA5G/2/
     */
    serializeFunction: function(code, creationFrame) {
        // 'eval(('.length == 6
        creationFrame.column = Math.max(1, creationFrame.column-2);
    
        // build padded code string (to generate accurate stacktraces)
        // if we run it through a minifier, we can get rid of the whitespaces and get accurate sourcemaps
        var codeString = '(';
        for (var i = 1; i < creationFrame.row; ++i) {
            codeString += '\n';
        }
        for (var i = 1; i < creationFrame.column; ++i) {
            codeString += ' ';
        }
        codeString += code.toString() + ')';
        codeString += "\n//@ sourceURL=" + this.prettyFileNameUrl(creationFrame.fileName);
        //codeString = 'eval(eval(' + this.escapeCode(codeString) + '))';
        codeString = 'eval(eval(' + JSON.stringify(codeString) + '))';
        
        // test serializing of functions
        // TODO: comment this thing out
        var funFromString = eval(codeString);
        squishy.assert(typeof funFromString === 'function', 'Supplied code is not a function.');
        
        // only override `toString`, so we still get the original function
        code.toString = function() { return codeString; };
        
        return code;
    },
    
    serializeFile: function(path) {
        // TODO: !
        // Need to consider AMD, Node's require, requirejs etc....
    },
    
    /**
     * Returns the code string to define a variable.
     */
    defVar: function(varName, varValue) {
        return 'var ' + varName + (varValue ? ' = ' + varValue : '') + ';\n';
    }
};

module.exports = CodeBuilder;