/**
 * This is the default asset manager implementation.
 * It uses express to serve external files.
 * TODO: Images
 * TODO: Optional lazy loading
 */
"use strict";

var url = require('url');
var path = require('path');
var fs = require('fs');

var mime = require('mime');

var CodeBuilder = require('squishy').CodeBuilder;

var ComponentDef = require('./ComponentDef');

/**
 * This library takes care of serving external files from node, using Express.
 */
module.exports = ComponentDef.lib({
    Host: ComponentDef.defHost(function(SharedTools, Shared) {
        var pubFolderRel,
            pubFolderAbs,
            publicUrl,
            baseUrl;
                
        /**
         * Serve the given file (that has already been verified to exist).
         */
        var doServeFile = function(fpath, req, res, next) {
            req.addListener('end', function () {
                var actualPath = fpath.split('?', 1)[0];
                
                // read file
                fs.readFile(fpath, function (err, data) {
                    // send file out
                    if (err) {
                        // could not read file
                        var err = new Error(err + ': ' + fpath);
                        err.status = 500;
                        next(err);
                    }
                    else {
                        var status = 200;
                        data = data.toString('utf8');
                        
                        // get mime type
                        // see: https://github.com/broofa/node-mime
                        var mimeType = mime.lookup(fpath);
                        res.writeHead(status, {'Content-Type': mimeType});
                        res.write(data);
                        res.end();
                    }
                });
            }).resume();
        };
                

        return {
            getPublicUrl: function(cfg) {
                var publicUrl = url.resolve(baseUrl, cfg.publicPath);
                return publicUrl + (publicUrl.endsWith('/') ? '' : '/');
            },
            
            /**
             * Send all assets of given components to client.
             */
            getClientAssets: function(componentNames, assetHandlers) {
                // re-build and send assets to client
                // consider caching these bad boys
                return {
                    files: this.getFileAssets(componentNames)

                    // include all auto-includes right away (for now)
                    //autoIncludes: this.getAutoIncludeAssets(componentNames, assetHandlers)
                };
            },
            
            /**
             * Iterates over all assets of the given category, of all components.
             * It calls the resolver on every such component to get the full name of the resource to be included.
             * It then calls mapper on every uniquely resolved resource.
             */
            forEachAsset: function(category, cb, componentNames) {
                var iterator = function(component) {
                    if (component.Assets && component.Assets[category]) {
                        try {
                            var entry = component.Assets[category];
                            cb(component, entry);
                        }
                        catch (err) {
                            console.error('Cannot parse `Assets.' + category + '` of component `' + component._def.FullName + '`: ' + err.stack);
                        }
                    }
                };
                
                if (componentNames) {
                    // iterate only over libs & selected components
                    Shared.Libs.forEach(iterator);
                    for (var i = 0; i < componentNames.length; ++i) {
                        var componentName = componentNames[i];
                        iterator(Shared[componentName]);
                    }
                }
                else {
                    Shared.forEachComponentOfAnyType(iterator);
                }
            },
            
        
            // ##############################################################################################################################
            // AutoIncludes
            
            initializeAutoIncludes: function(app, cfg) {
                // register file server for  external files
                Shared.forEachComponentOfAnyType(function(component) {
                    var compName = component._def.FullName;
                    app.get(publicUrl + compName + '/*', function(req, res, next) {
                        // get requested file path
                        var requestedPath = req.originalUrl;
                        console.assert(requestedPath.startsWith(publicUrl));

                        requestedPath = requestedPath.substring(publicUrl.length);

                        if (requestedPath.length < 2) {
                            var err = new Error('Illegal file request: ' + requestedPath);
                            err.status = 500;
                            next(error);
                            return;
                        }
                        
                        var fname = requestedPath.substring(requestedPath.indexOf('/', 1)+1);
                        
                        // try to serve file
                        this.serveFile(component, fname, req, res, next);
                    }.bind(this));
                }.bind(this));
            },
            
            /**
             * Get all `AutoIncludes` assets of all components.
             */
            getAutoIncludeAssets: function(assetHandlers) {
                // iterate over and remember all files to be included
                var includeCode = '';
                var allFilesPerCat = {};
                var allFilesPerComponent = this.autoIncludes = {};

                var iterator = function(component, files) {
                    var compName = component._def.FullName;
                    var compFolder = component._def.Folder;
                    
                    for (var categoryName in files) {
                        if (!files.hasOwnProperty(categoryName)) continue;
                        var allFilesInCat = allFilesPerCat[categoryName];
                        if (!allFilesInCat) {
                            allFilesPerCat[categoryName] = allFilesInCat = {};
                        }
                        
                        // get `include code` factory for this file
                        var factory = assetHandlers.autoIncludeCodeFactories[categoryName];
                        if (!factory) {
                            console.error('Invalid category in component ' + component + 
                                '\'s `Assets.AutoIncludes`: ' + categoryName + 
                                ' - Supported categories are: ' + Object.keys(codeFactories));
                            continue;
                        }
                        
                        var filesInCat = files[categoryName];
                        for (var i = 0; i < filesInCat.length; ++i) {
                            var fname = filesInCat[i];
                            if (assetHandlers.autoIncludeResolvers && assetHandlers.autoIncludeResolvers[categoryName]) {
                                // fix path (by, eg. appending the correct extension)
                                fname = assetHandlers.autoIncludeResolvers[categoryName](fname);
                            }
                            
                            var relFolder = publicUrl + compName + '/';
                            var includeUrl = url.resolve(relFolder, fname);
                            if (!allFilesInCat[includeUrl]) {
                                // new file: Add it
                                
                                allFilesInCat[includeUrl] = true;
                                if (!includeUrl.startsWith(relFolder)) {
                                    // external URL
                                    // nothing to be done here, since the file request will not go through here
                                }
                                else {
                                    // local URL
                                    var fpath = path.join(compFolder, fname);
                                    var actualPath = fpath.split('?', 1)[0];
                                    if (!fs.existsSync(actualPath)) {
                                        // file does not exist relative to component:
                                        // check if file exists in public directory
                                        fpath = path.join(pubFolderAbs, fname);
                                        actualPath = fpath.split('?', 1)[0];
                                        if (!fs.existsSync(actualPath)) {
                                            // cannot find file
                                            throw new Error('Could not find file `' + actualPath + '` for component `' + component + 
                                                '`. It was located neither relative to the component, nor in the public folder.');
                                        }
                                    }
                                    allFilesPerComponent[compName] = allFilesPerComponent[compName] || (allFilesPerComponent[compName] = {});
                                    allFilesPerComponent[compName][fname] = fpath;
                                }
                                includeCode += factory(includeUrl) + '\n';
                            }
                        }
                    }
                }.bind(this);
                this.forEachAsset('AutoIncludes', iterator);

                return includeCode;
            },
            
            /**
             * Try to serve a file from the given request
             */
            serveFile: function(component, fname, req, res, next) {
                var compName = component._def.FullName;
                
                // check if file is an asset for some component
                var fpath;
                if (!this.autoIncludes[compName] || !(fpath = this.autoIncludes[compName][fname])) {
                    // file was not requested explicitly by any component, try public folder:
                    fpath = path.join(pubFolderAbs, fname);
                    
                    // var err = new Error('Illegal file request: ' + path.join(compName, fname));
                    // err.status = 500;
                    // next(err);
                    // return;
                }
                
                // serve file
                doServeFile(fpath, req, res, next);
            },
        
            // ##############################################################################################################################
            // Files
            
            /**
             * `File`-type assets are maps of key-value pairs, indexed by type name, where each pair denotes 'name: path'.
             * The name is the name under which it will be available in the component's `asset` property and the path tells us where to find it.
             * The type tells us how to treat the data from the file.
             */
            getFileAssets: function(componentNames) {
                var allFilesPerCat = {};
                var allAssets = this.fileAssets = {};
            
                // iterate over all external files of all categories in all components:
                var iterator = function(component, files) {
                    var compName = component._def.FullName;
                    var compFolder = component._def.Folder;
                    
                    var assets = allAssets[compName] = {};
                    
                    for (var categoryName in files) {
                        if (!files.hasOwnProperty(categoryName)) continue;
                        var allFilesInCat = allFilesPerCat[categoryName];
                        if (!allFilesInCat) {
                            allFilesPerCat[categoryName] = allFilesInCat = {};
                        }
                        
                        // iterate over all files in this category, in this component
                        var filesInCat = files[categoryName];
                        for (var assetName in filesInCat) {
                            if (!filesInCat.hasOwnProperty(assetName)) continue;
                            
                            var fname = filesInCat[assetName];
                            
                            var relPath = compName + '/';
                            var compPath = url.resolve(relPath, fname);
                            var data = allFilesInCat[compPath];
                            if (!data) {
                                // new file: get it
                                var fpath;
                                if (!compPath.startsWith(relPath)) {
                                    // full path
                                    fpath = fname;
                                }
                                else {
                                    // local URL
                                    fpath = path.join(compFolder, fname);
                                    if (!fs.existsSync(fpath)) {
                                        // file does not exist relative to component:
                                        // check if file exists in public directory
                                        fpath = path.join(pubFolderAbs, fname);
                                        if (!fs.existsSync(fpath)) {
                                            // cannot find file
                                            throw new Error('Could not find file `' + fname + '` for component `' + component + 
                                                '`. It was located neither relative to the component, nor in the public folder.');
                                        }
                                    }
                                }
                                
                                // TODO: Support categories
                                // TODO: JSON.stringify & parse
                                allFilesInCat[compPath] = data = fs.readFileSync(fpath).toString('utf8');
                            }
                            
                            // store asset
                            assets[assetName] = data;
                        }
                    }
                };
                this.forEachAsset('Files', iterator, componentNames);
                
                return allAssets;
            },
        
            // ##############################################################################################################################
            // Initialize
            
            /**
             * Setup routes for serving component files.
             */
            initHost: function(app, cfg) {
                // setup paths & URLs
                pubFolderRel = cfg.publicFolder;
                try {
                    pubFolderAbs = fs.realpathSync(pubFolderRel);
                }
                catch (err) {
                    console.warn('Public folder does not exist: ' + pubFolderRel);
                    return
                }
                
                // re-implement static file sending because components eventually need a special lookup service
                baseUrl = cfg.baseUrl;
                if (!baseUrl.endsWith('/')) {
                    baseUrl += '/';
                }
                
                // start serving files from public folder(s)
                publicUrl = this.getPublicUrl(cfg);
                
                
                // initialize asset handling
                
                this.initializeAutoIncludes(app, cfg);
            }
        };
    }),
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
            
        var installFiles = function(allAssets) {
            for (var componentName in allAssets) {
                if (!allAssets.hasOwnProperty(componentName)) continue;
                
                // get component
                var component = Instance[componentName];
                if (!component) {
                    console.warn('Ignored assets for invalid component `' + componentName + '`');
                    continue;
                }
                var assets = allAssets[componentName];
                component.assets = assets;
            }
        };

        return {

            Public: {
                /**
                 * Initialize all given new assets.
                 */
                initializeClientAssets: function(allAssets, assetHandlers) {
                    installFiles(allAssets.files);
                }
            }
        };
    })
});