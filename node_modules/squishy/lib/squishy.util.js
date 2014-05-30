/*jslint node: true */
"use strict";

//define([], function() {

// ##############################################################################################################
// Debugging


/**
 * Returns a string identifying the caller of the caller of this function.
 */
squishy.getCallerInfo = function(line) {
    // if (printStackTrace) {
        
    // }
    // else 
    {
        return new Error().stack;
    }
};

/**
 * Standard assert statement.
 * Throws a string identifying caller, if assertion does not hold.
 */
squishy.assert = function(stmt, msg, line) {
    if (!stmt) {
        var info = "";
        if (msg) {
            info += msg + " -- ";
        }
        info += "ASSERTION FAILED at " + squishy.getCallerInfo(line);
        throw new Error(info);
    }
};

// ##############################################################################################################
// File paths

/**
 * Concats two partial paths with a "/".
 */
squishy.concatPath2 = function(file1, file2) {
    var path = file1;
    if (!path.endsWith("/") && !path.endsWith("\\")) {
        path += "/";
    }
    path += file2;
    return path;
};

/**
 * Concats multiple partial paths by "/".
 * 
 * @param root
 * @param file1
 */
squishy.concatPath = function(file1, file2/*, fileN */) {
    var path = "";
    for (var argLen = arguments.length, i = 1; i < argLen; ++i) {
        path = squishy.concatPath2(path, arguments[i]);
    }
    return path;
};


// ##############################################################################################################
// Object

/**
 * Clones the given object.
 * @param targetObj The object to copy all properties to, or null to create a new object.
 * @param {bool} deepCopy Whether to deep-copy elements (true by default).
 */
squishy.clone = function(obj, deepCopy, targetObj) {
    if (arguments.length === 1) {
        deepCopy = true;
    }

    targetObj = targetObj || ((obj instanceof Array) ? [] : {});

    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) continue;
        
        var prop = obj[i];
        if (deepCopy && (typeof(prop) === "object" || typeof(prop) === "array")) {
            // deep-copy if the property is an object or an array
            targetObj[i] = squishy.clone(obj[i], true);
        }
        else {
            // shallow-copy the property
            targetObj[i] = prop;
        }
    }
    return targetObj;
};

/**
 * Clones the given object. Ignores all properties (also of children) that do not pass the filter.
 * @param newObj The object to clone all properties to.
 * @param {bool} deepCopy Whether to deep-copy elements (true by default).
 */
squishy.cloneFiltered = function(obj, filter, deepCopy, newObj) {
    if (arguments.length === 2) {
        deepCopy = true;
    }

    newObj = newObj || ((obj instanceof Array) ? [] : {});

    for (var i in obj) {
        var prop = obj[i];
        if (!filter(prop)) continue;
        
        if (deepCopy && prop.getFirstProperty()) {
            // obj[i] is an object
            newObj[i] = squishy.clone(obj[i], true);
        }
        else {
            newObj[i] = prop;
        }
    }
    return newObj;
};

Object.defineProperty(Object.prototype, "getObjectPropertyCount", {
    enumerable: false,
    configurable: false,
    writable: false,
    value:
        /**
         * Determines how many properties the given object has.
         *
         * @see http://stackoverflow.com/questions/5533192/how-to-get-object-length-in-jquery
         */
        function() {
            var size = 0;
            for (var i in this) {
                ++size;
            }
            return size;
        }
});


Object.defineProperty(Object.prototype, "hasProperty", {
    enumerable: false,
    configurable: false,
    writable: false,
    value:
        /**
         * Checks whether the given object has the given property
         *
         * @param key
         */
        function(key) {
            return this.getObjectPropertyCount(key) === 0;
        }
});


Object.defineProperty(Object.prototype, "getFirstProperty", {
    enumerable: false,
    configurable: false,
    writable: false,
    value:
        /**
         * Returns the first property of the given object, or null if it has none.
         */
        function() {
            for (var prop in this)
                return this[prop];
            return null;
        }
});


Object.defineProperty(Object.prototype, "hasAnyProperty", {
    enumerable: false,
    configurable: false,
    writable: false,
    value:
        /**
         * Returns the first property of the given object, or null if it has none.
         */
        function() {
            for (var prop in this)
                return true;
            return false;
        }
});


// ##############################################################################################################
// Proper toString & code-string management functions

/**
 * Converts the given object to a string that can be eval'ed to return its original value.
 * Will probably not work properly on objects of custom type (at the very least, it's constructor will not be executed).
 */
squishy.objToEvalable = function(obj, codeName) {
    // since this builds the string of an rvalue, we must wrap it in "()"
    // this makes sure, it won't interpreted as a block of code
    // see: http://stackoverflow.com/questions/23092966/eval-wont-work-on-objects-that-contain-functions
    var code = "(" + squishy.objToString(obj) + ")";
    if (codeName) {
        code = squishy.nameCode(code, codeName);
    }
    return code;
};

/**
  * This is a "deep toString" function. Unlike JSON.stringify, this also works for functions.
  */
squishy.objToString = function(obj, json, layer, indent) {
    // TODO: Consider using proper stringbuilder for better performance
    var str = "";
    var isArray = obj instanceof Array;
    var isObject = typeof(obj) === "object";
    
    if (layer > 20)  {
        throw new Error("Possible cyclic object nesting in squishy.objToString().");
    }
    
    layer = layer || 0;
    
    // prepare indentation
    if (!indent) {
        indent = "";
        for (var i = 0; i < layer; ++i) {
            indent += "    ";
        }
    }
    
    // check object type (stupidly complicated JS type checking...)
    if (obj == null) {
        str += "null";
    }
    else if (!squishy.isDefined(obj)) {
        str += "undefined";
    }
    else if (typeof obj === "string") {
        str += JSON.stringify(obj);
    }
    else if (isArray || isObject) {
        var outerIndent = indent;
        str += (isArray ? "[" : "{") + "\n";
        indent += "    ";
        
        // iterate over all properties of array or object
        var iterator = function(propName) {
            var prop = obj[propName];
            
            var propStr = squishy.objToString(prop, json, layer+1, indent);
            
            if (isArray) {
                str += indent + propStr + ",\n";
            }
            else {
                if (json) {
                    str += indent + "\"" + propName + "\"" + " : " + propStr + ",\n";
                }
                else {
                    str += indent + propName + " : " + propStr + ",\n";
                }
            }
        };
        
        if (isArray) {
            // array
            for (var i = 0; i < obj.length; ++i) {
                iterator(i);
            }
        }
        else {
            // object
            for (var prop in obj) {
                if (!obj.hasOwnProperty(prop)) continue;
                iterator(prop);
            }
        }
        
        // remove dangling comma
        if (str.endsWith(",\n")) {
            str = str.substring(0, str.length-2);
        }

        // close array or object definition
        str += "\n" + outerIndent;
        str += isArray ? "]" : "}";
    }
    else {
        str += obj.toString();
    }
    return str;
};

/**
 * Logs a properly formatted string representation of the given object to console.
 */
squishy.log = function(obj) {
    console.log(squishy.objToString(obj));
};



// ##############################################################################################################
// String

// add utilities to string
String.prototype.startsWith = function(prefix) {
    return this.substring(0, prefix.length) === prefix;
};

String.prototype.endsWith = function(suffix) {
    return this.substring(this.length - suffix.length, this.length) === suffix;
};



// ##############################################################################################################
// Flags

/**
 * Adds the given flag to the current set of flags and returns the result.
 * This is the equivalent of setting a bit in a number to 1.
 */
squishy.setFlag = function(flags, newFlag) {
    return flags | newFlag;
};

/**
 * Removes the given flag from the current set of flags and returns the result.
 * This is the equivalent of setting a bit in a number to 0.
 */
squishy.removeFlag = function(flags, oldFlag) {
    return flags & ~oldFlag;
};



// ##############################################################################################################
// URL

/**
 * Returns a hashmap of all GET arguments of the current URL.
 *
 * @see http://stackoverflow.com/questions/5448545/how-to-retrieve-get-parameters-from-javascript
 */
squishy.retrieveURLArguments = function() {
    var prmstr = window.location.search.substr(1);
    var prmarr = prmstr.split ("&");
    var params = {};

    for ( var i = 0; i < prmarr.length; i++) {
        var tmparr = prmarr[i].split("=");
        params[tmparr[0]] = tmparr[1];
    }
    return params;
};

/**
 * Extracts the folder from a complete path.
 * 
 * @param path A nix-style path (using '/' as separator).
 */
squishy.extractFolder = function(path) {
    var folder = path.substring(0, path.lastIndexOf('/'));
    return folder;
};



// ##############################################################################################################
// Arrays

/**
 * Creates an array of given size.
 * If the optional defaultVal parameter is supplied,
 * initializes every element with it.
 * NOTE: There is a design bug in Google's V8 JS engine that sets an arbitrary threshold of 99999 to be the max size for array pre-allocation.
 * @param {number} size Number of elements to be allocated.
 * @param {Object=} defaultVal Optional value to be used to set all array elements.
 */
squishy.createArray = function(size, defaultVal) {
    try {
        var arr = new Array(size);
        if (arguments.length == 2) {
            // optional default value
            for (var i = 0; i < size; ++i) {
                if (typeof defaultVal == "object")
                    arr[i] = squishy.clone(defaultVal, false);     // shallow-copy default value
                else
                    arr[i] = defaultVal;                        // simply copy it
            }
        }
    }
    catch (excep) {
        console.error("Could not create array of size: " + size);
        throw excep;
    }
    return arr;
};

/**
 * Removes the given item from the given array, if it exists.
 */
squishy.removeItem = function(arr, item) {
    var idx = arr.indexOf(item);
    if (idx >=0) {
        array.splice(idx, 1);
    }
};

/**
 * @see http://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array-in-javascript
 */
Object.defineProperty(Array.prototype, "shuffle", {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function() {
        for(var j, x, i = this.length; i; j = Math.floor(Math.random() * i), x = this[--i], this[i] = this[j], this[j] = x);
    }
});


/**
 * Calls callback(propName, prop) on every own property of the given object.
 */
squishy.forEachOwnProp = function(object, callback, thisArg) {
    for (var propName in object) {
        if (!object.hasOwnProperty(propName)) continue;
        callback.call(thisArg, propName, object[propName]);
    };
};

// ##############################################################################################################
// Stable merge sort

// Add stable merge sort to Array prototypes.
// Note: We wrap it in a closure so it doesn't pollute the global
//       namespace, but we don't put it in $(document).ready, since it's
//       not dependent on the DOM.
(function() {
  /**
   * Performs a stable merge sort on this array.
   * Note that it does not change the array, but returns a fresh copy.
   * 
   * @param compare The compare function to be used.
   * @see http://stackoverflow.com/questions/1427608/fast-stable-sorting-algorithm-implementation-in-javascript
   */
Object.defineProperty(Array.prototype, "stableSort", {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function(compare) {
        var length = this.length,
            middle = Math.floor(length / 2);

        if (!compare) {
          compare = function(left, right) {
            if (left < right) 
              return -1;
            if (left == right)
              return 0;
            else
              return 1;
          };
        }

        if (length < 2)
          return this.slice();

        return merge(
          this.slice(0, middle).stableSort(compare),
          this.slice(middle, length).stableSort(compare),
          compare
        );
        
        function merge(left, right, compare) {
            var result = [];
            
            while (left.length > 0 || right.length > 0) {
              if (left.length > 0 && right.length > 0) {
                if (compare(left[0], right[0]) <= 0) {
                  result.push(left[0]);
                  left = left.slice(1);
                }
                else {
                  result.push(right[0]);
                  right = right.slice(1);
                }
              }
              else if (left.length > 0) {
                result.push(left[0]);
                left = left.slice(1);
              }
              else if (right.length > 0) {
                result.push(right[0]);
                right = right.slice(1);
              }
            }
            return result;
        }
    }
});
  
  /**
   * Select a random element from this array. 
   */
Object.defineProperty(Array.prototype, "randomElement", {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function() {
        var idx = squishy.randomInt(0, this.length-1);
        return this[idx];
    }
});
})();


// ##############################################################################################################
// Number/math utilities

/**
 * Generates a random integer between min and max, inclusive.
 */
squishy.randomInt = function(min, max) {
    if (!squishy.isDefined(min)) {
        min = -2147483647;
        if (!squishy.isDefined(max)) {
            max = 2147483647;
        }
    }
    return Math.ceil((Math.random() * (max-min+1))+min-1);
};


// ##############################################################################################################
// Time-related utilities

/**
 * Returns the current system time in milliseconds for global synchronization and timing events.
 */
squishy.getCurrentTimeMillis = function() {
    return new Date().getTime();
};

/**
 * Returns the current system time in milliseconds, at a higher resolution.
 * @see http://stackoverflow.com/questions/6875625/does-javascript-provide-a-high-resolution-timer
 */
squishy.getCurrentTimeMillisHighRes = (function() {
    if (typeof(process) !== 'undefined') {
        // node
        // see: http://nodejs.org/api/process.html#process_process_hrtime
        var time = process.hrtime();
        return time[0] * 1e3 + time[1] * 1e-6;
    }
    else if (performance.now) {
        return function() { return performance.now(); };
    } else {
        if (performance.webkitNow) {
            return function() { return performance.webkitNow(); };
        } else {
            return function() { return new Date().getTime(); }; // fall back
        }
    }
})();



// ##############################################################################################################
// Type checking

/**
 * Checks whether the given type indicates that the object has been declared and assigned a value.
 *
 * @param objType
 */
squishy.isDefinedType = function(objType) {
    return objType !== "undefined";
};


/**
 * Checks whether the given object is undefined.
 *
 * @param obj
 */
squishy.isDefined = function(obj) {
    return squishy.isDefinedType(typeof(obj));
};


/**
 * Sets obj[propName] = value, if the object does not yet have the property.
 *
 * @param obj
 */
squishy.setIfUndefined = function(obj, propName, value) {
    if (!squishy.isDefined(obj[propName])) {
        obj[propName] = value;
    }
};

/**
 * Checks whether the given object has been assigned a value and is not null nor false.
 *
 * @param obj
 */
squishy.isSet = function(obj) {
    return obj !== null && obj !== false;
};


// ##############################################################################################################
// Add some helper methods for better OOP and related language features

/**
 * Creates a new object with the given constructor, having the given array of arguments.
 * @see http://stackoverflow.com/a/14378462/2228771
 */
squishy.createInstance = function(constructor, argArray) {
    var realArgArray = [null];
    for (var i = 0; i < argArray.length; ++i) {
        realArgArray.push(argArray[i]);
    }
    var factoryFunction = constructor.bind.apply(constructor, realArgArray);
    return new factoryFunction();
},

/**
 * Create a simple class that does not extend from another class.
 */
squishy.createClass = function(ctor, methods) {
    if (typeof(ctor) === "object") {
        // Make sure, we inherit from functions. Else instanceof will not work at all and our OOP model fails.
        methods = ctor;
        ctor = function() {};
    }
    ctor = ctor || function() {};
    ctor.prototype = methods || {};
    return ctor;
};

/**
 * Javascript-style inheritance.
 * @see http://stackoverflow.com/questions/4152931/javascript-inheritance-call-super-constructor-or-use-prototype-chain
 */
squishy.extendClass = function(superClass, extendedCtor, extendedProto) {
    if (typeof(extendedCtor) !== 'function') {
        // did not define an extended ctor
        
        // so the second argument is actually the prototype
        squishy.assert(typeof(extendedCtor) === 'object', "Constructor must be a function or omitted and prototype must be an object.");
        extendedProto = extendedCtor;
        
        // define default ctor
        extendedCtor = function() { this._super(); };
    }
    var _origCtor = extendedCtor;
    var superProto = Object.create(superClass.prototype);
    extendedCtor = function() {
        squishy.assert(this, "this not available in ctor -> Make sure to only create new objects with `new MyCtor()`, where `MyCtor` is your extended class's ctor.");
        
        // set super ctor
        var superCalled = false;
        this._super = function() { superClass.apply(this, arguments); superCalled = true; }.bind(this);
        this._super.prototype = superProto;
        
        _origCtor.apply(this, arguments);
        
        squishy.assert(superCalled, "Inherited class did not call _super(...) in constructor. Make sure to call this._super(...) in inherited constructors!");
    };

    // Setup inheritance:
    // Avoid instantiating the base class just to setup inheritance.
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/create
    // Also, do a recursive merge of two prototypes to maintain the inheritance chain.
    extendedCtor.prototype = superProto;
    for (var key in extendedProto) {
        extendedCtor.prototype[key] = extendedProto[key];
    }
    
    // make sure, _super does not exist
    squishy.assert(!squishy.isDefined(extendedCtor.prototype._super), "The _super object is a pre-defined object in classes, and must not be overwritten.");
    
    
    // reset constructor
    Object.defineProperty(extendedCtor.prototype, 'constructor', { 
        enumerable: false,
        value: extendedCtor
    });
    
    // check for abstract prototype properties
    Object.keys(superClass.prototype).forEach(function(propName) {
        var prop = superClass.prototype[propName];
        if (prop instanceof squishy.AbstractMethodType) {
            if (!(extendedProto[propName] instanceof Function)) {
                throw new Error("Abstract method \"" + propName + "\" must be overridden in super class.");
            }
        }
    });
    
    return extendedCtor;
};

/**
 * Check if classB extends classA
 */
squishy.doesClassExtend = function(classB, classA) {
    return classB.prototype instanceof classA;
};

/**
 * A placeholder for an abstract method.
 */
squishy.AbstractMethodType = squishy.createClass(
    function() {},
    {
        toString: function() { return 'new squishy.AbstractMethodType()'; }
    }
)

/**
 * Returns a new abstract method placeholder, which will be checked by squishy.extend.
 */
squishy.abstractMethod = function() {
    return new squishy.AbstractMethodType();
};

// var testOOP = function () {
    // var A = squishy.createClass(
        // function(x) {
            // this.x = x;
            // console.log("A(): " + x);
        // },{
            // // methods
            // x: squishy.abstractMethod()
        // }
    // );
    
    // var B = squishy.extendClass(A,
        // function(y) {
            // this._super('a');
            // this.y = y;
            // console.log("B(): " + y);
        // },{
            // // methods
            // x: function() {}
        // }
    // );
    
    // console.log("testing");
    
    // console.log("Creating a...");
    // squishy.assert(!(a instanceof B), "a !instanceof B");
    // var a = new A('a');

    // console.log("Creating b...");
    // var b = new B('b');
    // squishy.assert(b instanceof B, "b instanceof B");
    // squishy.assert(b instanceof A, "b instanceof A");
// };
// testOOP();

/**
 * 
 */
squishy.makeFlagEnum = function(_obj, methods) {
    return squishy.makeEnum(_obj, methods, true);
};

/**
 * 
 */
squishy.makeEnum = function(_values, methods, flags) {
    var nameTable = {};
    var values = [];
    
    // Iterate over all enum values and give them increasing values, if they don't have any yet.
    var obj;
    var minValue, maxValue;
    if (_values instanceof Array) {
        var lastValue = minValue = 1;
        obj = {};
        _values.forEach(function(name) {
            squishy.assert(typeof name === "string", "An enum defined as an array must only contain names.");
            obj[name] = lastValue;
            if (flags) {
                lastValue *= 2;     // flags enum: Every value represents one bit
            }
            else {
                ++lastValue;        // normal enum: Count in steps of 1
            }
        });
        maxValue = flags ? lastValue/2 : lastValue-1;
    }
    else {
        throw new Error('Custom enum objects are not yet supported.');
        //obj = _values;
    }
    
    // Take inventory of all names.
    Object.getOwnPropertyNames(obj).forEach(function(name) {
        var value = obj[name];
        if (value instanceof Function) return;
        nameTable[value] = name;
        values.push(value);
    });
    
    if (methods) {
        // copy methods (and other properties) to the object
        squishy.clone(methods, true, obj);
    }
    
    // add nameTable and values to enum
    obj.nameTable = nameTable;
    obj.values = values;
    
    // add a method to obtain the nameTable
    Object.defineProperty(obj, 'getNames', {
        value: function() {
            return obj.nameTable;
        }
    });
    
    // add a method to obtain all values (excluding functions)
    Object.defineProperty(obj, 'getValues', {
        value: function() {
            return obj.values;
        }
    });
    
    // add a toString method
    Object.defineProperty(obj, 'isValidValue', {
        value: function(enumValue) {
            if (flags) {
                throw new Error('isValidValue is not yet supported for flag enums.');
            }
            return enumValue >= minValue && enumValue <= maxValue;
        }
    });
    
    // add a toString method
    Object.defineProperty(obj, 'toString', {
        value: function(enumValue) {
            if (flags) {
                throw new Error('toString is not yet supported for flag enums.');
            }
            return obj.nameTable[enumValue];
        }
    });
    
    return obj;
};


// ##############################################################################################################
// Event & PseudoMutex

/**
 * Creates a new event, representing a list of event handler callbacks.
 */
squishy._Event = squishy.createClass(
    function(sender) {
        this.sender = sender;
        this.listeners = [];
    },{
        // methods
        
        /**
         * Adds the given callback function to this event.
         */
        addListener: function(listener) {
            this.listeners.push(listener);
        },
        
        /**
         * Removes the given callback function from this event.
         */
        removeListener: function(listener) {
            squishy.removeItem(this.listeners, listener);
        },
        
        /**
         * Removes all listeners.
         */
        clear: function() {
            this.listeners.length = 0;
        },
        
        /**
         * Calls all event handlers of this event with all given arguments, and this = the object given in the event constructor.
         */
        fire: function() {
            for (var i = 0; i < this.listeners.length; ++i) {
                var listener = this.listeners[i];
                listener.apply(this, arguments);
            }
        }
    }
);

/**
 * Creates a new C#-style event (which is primarily a list of event listeners);
 */
squishy.createEvent = function(sender) { return new squishy._Event(sender); };

/**
 * A pseudo mutex can achieve the often necessary task of firing an event, once a specific (but possibly unknown) set of callbacks have finished doing their job.
 */
squishy._PseudoMutex = squishy.createClass(
    function() {
    },{
        // prototype
        counter: 0,
        evt: squishy.createEvent(),
        
        wait: function(cb, checkNow) {
            if (checkNow && counter == 0) {
                cb();
            }
            else {
                // wait until count is back to 0,
                // then fire callback
                this.evt.addListener(function() {
                    cb();
                });
            }
        },
        
        use: function() {
           ++this.counter;
        },
        
        release: function() {
            --this.counter;
            if (this.counter <= 0) {
                squishy.assert(this.counter == 0, "Invalid use of mutex: Released more often than used.");
                this.evt.fire();
                this.evt.clear();
            }
        }
    }
);

squishy.createPseudoMutex = function() {
    return new squishy._PseudoMutex();
};


//    return squishy;
//});