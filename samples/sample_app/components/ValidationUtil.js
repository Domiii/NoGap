/**
 * This file contains basic utilities to validate some user input.
 */
"use strict";

var NoGapDef = require('nogap').Def;


module.exports = NoGapDef.component({
    /**
     * Base is available in both, host and client.
     */
    Base: NoGapDef.defBase(function(SharedTools, Shared, SharedContext) {
    	var TitleMinLength = 1;		// note: In some languages, a single character name or title actually makes sense
    	var TitleMaxLength = 50;

        return {
        	/**
        	 * Verifies if the given name or title is `sensible` according to certain parameters.
        	 * Note that the default encoding in HTML5 is UTF-8 (which is also what we are using here).
        	 * @see http://utf8-chartable.de/
        	 */
            validateNameOrTitle: function(title) {
                if (!title) return null;

                title = this.trimNameOrTitle(title);

            	// check length
            	if (title.length < TitleMinLength || title.length > TitleMaxLength) return false;

            	// check characters against UTF-8 table
            	var valid = true;
            	//var hex = '';
            	for (var i = 0; i < title.length; ++i) {
            		var c = title.charCodeAt(i);
            		//hex += '0x' + c.toString(16) + ' ';
            		if (c < 0x20) { valid = false; break; }						// control characters
            		if (c > 0x20 && c < 0x2B) { valid = false; break; }			// special characters
            		if (c == 0x2f) { valid = false; break; }					// slash
            		if (c > 0x39 && c < 0x41) { valid = false; break; }			// special characters
            		if (c > 0x5a && c < 0x61) { valid = false; break; }			// special characters
            		if (c > 0x7a && c < 0x80) { valid = false; break; }			// special characters
            		if (c >= 0xC280 && c <= 0xC2A0) { valid = false; break; }	// mostly control characters
            	}
            	//console.log(hex);

                return valid ? title : false;
            },

            /**
             *
             */
            trimNameOrTitle: function(title) {
                return title.trim();
            }
        };
    })
});