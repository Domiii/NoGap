/*jslint node: true */
"use strict";

/**
 * 
 * This file contains a collection of utilities for DOM manipulation, management and rendering.
 * Will only do anything in the context of a browser or browser-like environment: Global "window" must exist
 * 
 */

 
if (typeof(window) !== "undefined") {
    // ##############################################################################################################
    // Line drawing

    /**
     * Adds a new div, representing a line from from to to, to the given container.
     * 
     * @param {Element} container The container that the line div should be added to.
     * @param {Array.<Number, Number>} from x and y coordinates of first point.
     * @param {Array.<Number, Number>} from x and y coordinates of second point.
     * @param {Color=} color The color of the line. (Default = None)
     * @param {Number=} thickness The stroke thickness of the line in pixels. (Default = None)
     */
    squishy.drawLine = function(container, from, to, color, thickness) {
        var ax = from[0];
        var ay = from[1];
        var bx = to[0];
        var by = to[1];
        
        // compute counter-clockwise angle from the positive x-axis (in radians)
        var angle = Math.atan2(by-ay, bx-ax);
        
        var length=Math.sqrt((ax-bx)*(ax-bx)+(ay-by)*(ay-by));
        var div = document.createElement("div");
        div.style.cssText = 
            "width:" + length + "px;" + ";position:absolute;top:" + (ay) + "px;left:" + (ax) + "px;";
            
        if (color) {
            div.style.cssText += "background-color:" + color;
        }
        
        if (thickness) {
            div.style.cssText += "height:" + thickness + "px;";
        }
        
        // translate to origin
        squishy.transformOrigin(div);
        
        // rotate
        squishy.transformRotation(div, angle);

        // add arrow to container
        container.appendChild(div);
        return div;
    };

    
    // ##############################################################################################################
    // Canvas & rendering
    
    window.requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame ||
                              window.webkitRequestAnimationFrame || window.msRequestAnimationFrame;
     
    // ##############################################################################################################
    // Transformations

    /**
     * Scales an element in size. 
     *
     * @see http://www.w3schools.com/css/css3_2dtransforms.asp
     */
    squishy.transformScale = function(targetEl, factorX, factorY) {
        squishy.transformOrigin(targetEl);
        
        var cssString = "scale(" + factorX + ", " + factorY + ");";
        var fullCSSString = " transform:" + cssString;
        fullCSSString += "-ms-transform:" + cssString;   /* IE 9 */
        fullCSSString += "-webkit-transform:" + cssString;  /* Safari and Chrome */
        
        targetEl.style.cssText += fullCSSString;
    };

    /**
     * Sets an element's rotational angle.
     * NOTE: In order to make this work correctly, you might have to first translate the element's origin into its context's origin by calling transformOrigin(targetEl) first.
     *
     * @param {Element} targetEl
     * @param {Number} angle
     * @param {String=} angleUnits The units of the angle. That is either "rad" or "deg" ("rad" is the default).
     * @see http://www.w3schools.com/css/css3_2dtransforms.asp
     */
    squishy.transformRotation = function(targetEl, angle, angleUnits) {
        angleUnits = angleUnits || "rad";
        var angleString = angle + angleUnits;
        
        // create browser-independent CSS style
        var fullCSSString =
            "transform:rotate(" + angleString + ");" +
            "-ms-transform:rotate(" + angleString + ");" +
            "-moz-transform:rotate(" + angleString + ");" +
            "-webkit-transform:rotate(" + angleString  + ");" + 
            "-o-transform:rotate(" + angleString + ");";
        
        targetEl.style.cssText += fullCSSString;
    };

    /**
     * Translates an element's position. 
     *
     * @see http://www.w3schools.com/css/css3_2dtransforms.asp
     */
    squishy.transformOrigin = function(targetEl, originX, originY) {
        originX = "0%";
        originY = "0%";
        var cssString = originX + " " + originY + ";";
        var fullCSSString = " transform-origin:" + cssString;
        fullCSSString += "-moz-transform-origin:" + cssString;   /* IE 9 */
        fullCSSString += "-webkit-transform-origin:" + cssString;  /* Safari and Chrome */
        fullCSSString += "-o-transform-origin:" + cssString;
        
        targetEl.style.cssText += fullCSSString;
    };
     
    // TODO: Add squishy.transformRotate function


    // ##############################################################################################################
    // Text DOM

    /**
     * Appends a new text node to the given target Element.
     *
     * @param {Element} element
     * @param {String} text
     */
    squishy.appendText = function(element, text) {
        element.appendChild(document.createTextNode(text));
    };


    // ##############################################################################################################
    // DOM selectors

    /**
     * Returns the given element or dies with the given message
     *
     * @param {String} elementName
     * @param {String=} dieMessage
     * @param {Element=} root The selection root. Default = document.
     */
    squishy.getElementByIdOrDie = function(elementId, dieMessage, root) {
        var root = root || document;
        var el = root.getElementById(elementId);
        squishy.assert(el, dieMessage || "Could not find element with id = " + elementId);
        return el;
    };

     

    // ##############################################################################################################
    // Mouse & Touch Events

    /**
     * Copies "correctified" client x and y values into the given 2D target array.
     * 
     * 
     * @param evt Mouse or touch event.
     * @param {Array.<Number, Number>} target.
     * 
     * @see http://stackoverflow.com/questions/5885808/includes-touch-events-clientx-y-scrolling-or-not
     */
    squishy.getRelativeEventCoordinates = function(evt, target) {
        var winPageX = window.pageXOffset,
            winPageY = window.pageYOffset,
            x = evt.clientX,
            y = evt.clientY;

        if (evt.pageY === 0 && Math.floor(y) > Math.floor(evt.pageY) ||
            evt.pageX === 0 && Math.floor(x) > Math.floor(evt.pageX)) {
            // iOS4 clientX/clientY have the value that should have been
            // in pageX/pageY. While pageX/page/ have the value 0
            x = x - winPageX;
            y = y - winPageY;
        } 
        else if (y < (evt.pageY - winPageY) || x < (evt.pageX - winPageX) ) {
            // Some Android browsers have totally bogus values for clientX/Y
            // when scrolling/zooming a page. Detectable since clientX/clientY
            // should never be smaller than pageX/pageY minus page scroll
            x = evt.pageX - winPageX;
            y = evt.pageY - winPageY;
        }

        target[0] = x;
        target[1] = y;
    };

    /**
     * Check whether touch functionality is supported in DOM.
     *
     * @see https://coderwall.com/p/egbgdw
     */
    squishy.domSupportsTouch = function() {
        return 'ontouchstart' in window || 'msmaxtouchpoints' in window.navigator;
    };

    /**
     * Triggers the given arguments on click or on touchend.
     */
    squishy.onClick = function(element, _callbackArgs) {
        if (typeof(element) === "string") {
            // get element by id
            element = squishy.getElementByIdOrDie(element);
        }
        // copy arguments
        var callArgs = squishy.createArray(arguments.length-1);
        for (var i = 1; i < arguments.length; ++i) {
            callArgs[i-1] = arguments[i];
        }
        
        // add click event
        var clickArgs = ["click"].concat(callArgs);
        element.addEventListener.apply(element, clickArgs);
        
        if (squishy.domSupportsTouch()) {
            // add touch event
            var touchArgs = ["touchend"].concat(callArgs);
            element.addEventListener.apply(element, touchArgs);
        }
    };

    /**
     * Triggers the given arguments on mousedown or on touchstart.
     */
    squishy.onPress = function(element, _callbackArgs) {
        if (typeof(element) === "string") {
            // get element by id
            element = squishy.getElementByIdOrDie(element);
        }
        // copy arguments
        var callArgs = squishy.createArray(arguments.length-1);
        for (var i = 1; i < arguments.length; ++i) {
            callArgs[i-1] = arguments[i];
        }
        
        // add click event
        var clickArgs = ["mousedown"].concat(callArgs);
        element.addEventListener.apply(element, clickArgs);
        
        if (squishy.domSupportsTouch()) {
            // add touch event
            var touchArgs = ["touchstart"].concat(callArgs);
            element.addEventListener.apply(element, touchArgs);
        }
    };


    // ##############################################################################################################
    // String handling & rendering

    /**
     * Returns inner text of the given element, without surrounding DOM.
     * 
     * @param element The DOM element to get the given text from.
     * 
     * @see http://stackoverflow.com/a/6743966/2228771
     */
    squishy.getDOMText = function(element) {
        // innerText for IE, textContent for other browsers
        return element.innerText || element.textContent;
    };

    /**
     * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
     * 
     * @param text The text to be rendered.
     * @param {String} font The css font descriptor that text is to be rendered with (e.g. "bold 14px verdana").
     * 
     * @see http://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
     */
    squishy.getTextWidth = function(text, font) {
        // if given, use cached canvas for better performance
        // else, create new canvas
        var canvas = squishy.getTextWidth.canvas || (squishy.getTextWidth.canvas = document.createElement("canvas"));
        var context = canvas.getContext("2d");
        context.font = font;
        var metrics = context.measureText(text);
        return metrics.width;
    };


    /**
     * Traverses the DOM of the given targetElement and makes sure that the text of all it's ancestor elements fits.
     */
    squishy.truncateElementTexts = function(targetElement, font, ellipsis) {
        // TODO:
    };

    /**
     * Returns text whose display width does not exceed the given maxPixelsWidth (in pixels).
     * If the given text is too wide, it will be truncated so that text + ellipsis
     * is still at most maxPixelsWidth pixels wide.
     * Example:
     *   var maxWidth = 100;
     *   var fontStyle = "bold 14px arial";
     *   console.log(truncateText("hello! How are you?", fontStyle, maxWidth));
     * 
     * @param {String} text The text to be truncated.
     * @param {String} font The css font descriptor that text is to be rendered with.
     * @param {Number} maxWidth Max display width of string.
     * @param {Element=} targetElement Optional element that should contain the text.
     * @param {String=} ellipsis Default = "...".
     * 
     */
    squishy.truncateText = function(text, font, maxPixelsWidth, targetElement, ellipsis) {
        if (targetElement) {
            // subtract padding, margin & border from max pixel width
            var jqEl = $(targetElement);
            maxPixelsWidth -= jqEl.innerWidth() + parseInt(jqEl.css("padding-left"));
        }
        ellipsis = ellipsis || "...";
        
        var width;
        var len = text.length;
        
        // TODO: Use binary search & heuristics to speed up the process for very long text
        while ((width = squishy.getTextWidth(text, font)) > maxPixelsWidth) {
            --len;
            text = text.substring(0, len) + ellipsis;
        }
        return text;
    };


    // ##############################################################################################################
    // Images

    /**
     * @param {String} src The URL of the image to be loaded.
     */
    squishy.loadImage = function(src, callback) {
        var img = new Image();
        if (callback) {
            img.onload = function() {
                callback(img);
            };
        }
        img.src = src;
    };

    /**
     * Creates a new DOM element that has a background image and takes the image's size.
     * @see http://stackoverflow.com/questions/15961824/css-how-to-set-container-size-equal-to-background-image-size
     *
     * @param {Element} elem 
     */
    squishy.addBackgroundImage = function(elem, imgSrc) {
        var img = document.createElement("img");
        elem.style.cssText += "display:inline-block";
        img.src = imgSrc;
        elem.appendChild(img);
    };


    // ##############################################################################################################
    // DOM initialization

    // /**
    //  * Load a script (requires JQuery).
    //  * WARNING: Only works during initialization.
    //  * Returns the jQuery ajax call object.
    //  * You can use the return value to add success and fail handlers.
    //  * 
    //  * @param relativeFilePath The path of the script, relative to the folder of the currently executing script.
    //  * 
    //  * @see http://stackoverflow.com/questions/13261970/how-to-get-the-absolute-path-of-the-current-javascript-file-name
    //  */
    // squishy.loadScriptOnInit = function(relativeFilePath) {
    //     var scripts = document.getElementsByTagName("script");
    //     var callerPath = scripts[scripts.length-1].src;
    //     var folder = squishy.extractFolder(callerPath);
    //     return $.getScript( folder + "/" + relativeFilePath);
    //     //   .fail(function( jqxhr, settings, exception ) {
    //     //       console.log("Unable to load script: " + exception);
    //     //   })
    //     //   .done(function( script, textStatus ) {
    //     //     console.log( textStatus );
    //     //   })
    // };


    // ##############################################################################################################
    // CSS 3.0 capabilities

    /**
     * Adds shadow to the given element.
     *
     * @see http://css3gen.com/box-shadow/
     * 
     * @param {Element} targetEl
     * @param {Number} thicknessPx
     * @param {String=} color (default = "gray")
     * @param {Number=} blurPx (default = 10)
     * @param {Number=} spreadPx (default = 0)
     */
    squishy.addShadow = function(targetEl, thicknessPx, color, blurPx, spreadPx) {
        color = color || "gray";
        blurPx = blurPx || 10;
        spreadPx = spreadPx || 0;
        var shadowString = thicknessPx + "px " + thicknessPx + "px " + blurPx + "px " + spreadPx + "px " + color;
        var fullShadowString = "box-shadow: " + shadowString + ";";
        fullShadowString += "-webkit-box-shadow: " + shadowString + ";";
        fullShadowString += "-moz-box-shadow: " + shadowString + ";";
        targetEl.style.cssText += fullShadowString;
    };

    // ##############################################################################################################
    // JQuery

    // add some utilities to jQuery

    var modjQuery = function modJquery() {
        $( document ).ready(function() {
            // add centering functionality to jQuery components
            // see: http://stackoverflow.com/questions/950087/how-to-include-a-javascript-file-in-another-javascript-file
            jQuery.fn.center = function (relativeParent) {
                if (undefined === relativeParent) relativeParent = $(window);
                var elem = $(this);
                
                var parentOffset = relativeParent.offset();
                var leftOffset = Math.max(0, ((relativeParent.outerWidth() - elem.outerWidth()) / 2) + relativeParent.scrollLeft());
                var topOffset = Math.max(0, ((relativeParent.outerHeight() - elem.outerHeight()) / 2) + relativeParent.scrollTop());
                if (undefined !== parentOffset)
                {
                    leftOffset += parentOffset.left;
                    topOffset += parentOffset.top;
                }
                elem.offset({left : leftOffset, top : topOffset});
                return this;
            };
            
            jQuery.fn.centerWidth = function (relativeParent) {
                if (undefined === relativeParent) relativeParent = $(window);
                var elem = $(this);
                
                
                var parentOffset = relativeParent.offset();
                var leftOffset = Math.max(0, ((relativeParent.outerWidth() - elem.outerWidth()) / 2) + relativeParent.scrollLeft());
                if (undefined !== parentOffset)
                {
                    leftOffset += parentOffset.left;
                }
                elem.offset({left : leftOffset, top : elem.offset().top});
                return this;
            };
            
            // Add text width measurement tool to jQuery components
            // see: http://stackoverflow.com/questions/1582534/calculating-text-width-with-jquery
            $.fn.textWidth = function(){
              var html_org = $(this).html();
              var html_calc = '<span>' + html_org + '</span>';
              $(this).html(html_calc);
              var width = $(this).find('span:first').width();
              $(this).html(html_org);
              return width;
            };
        });
	};

	if (typeof(requirejs) !== 'undefined') {
    	requirejs(["jquery"], function(jQuery) {
    		modjQuery(jQuery);
    	});
	}
	else if (jQuery) {
		modjQuery
	}
}