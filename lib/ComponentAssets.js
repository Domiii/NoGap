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
    Base: ComponentDef.defBase(function(SharedTools, Shared, SharedContext) {
        return {
            getPublicPath: function(componentName, fileName) {
                //return publicUrl + componentName + '/';
                //var path = componentName + this.publicUrl;
                var path = '/pub/' + (componentName ? (componentName + '/') : '');
                if (fileName) {
                    path += fileName;
                }
                return path;
            },

            initBase: function() {
                // add tool for allowing access to public files
                SharedTools.getPublicPath = this.getPublicPath.bind(this);
            }
        };
    }),


    Host: ComponentDef.defHost(function(SharedTools, Shared) {
        var pubFolderRel,
            pubFolderAbs,
            publicUrl,
            baseUrl;
                
        /**
         * Serve the given file (that has already been verified to exist).
         */
        var doServeFile = function(fpath, req, res, next) {
            //console.log('Client requested file: ' + fpath);
            req.addListener('end', function () {
                // read file
                fs.readFile(fpath, function (err, data) {
                    // send file out
                    if (err) {
                        // could not read file
                        var err = new Error(err + ': ' + req.url);
                        err.status = 500;
                        next(err);
                        //console.warn('Client requested invalid files: ' + err);
                    }
                    else {
                        var status = 200;
                        //data = data.toString('utf8');
                        
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
            NoGapIncludes: {
                js: [
                    'bluebird.js'
                ]
            },

            AssetFileReaders: {
                /**
                 * Return file content as-is
                 */
                string: function(fpath) {
                    // TODO: Asynchronous reading
                    var fileContent = fs.readFileSync(fpath);
                    return fileContent.toString('utf8');
                },

                /**
                 * Return file content as-is, then innitialize it as Node module on the client side
                 *
                 * TODO: Multi-file node modules?
                 */
                code: function(fpath) {
                    var fileContent = fs.readFileSync(fpath);
                    return fileContent.toString('utf8');
                }
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
                this.publicUrl = publicUrl = this.getPublicUrl(cfg);
                
                
                // initialize asset provision
                this._registerAssetPathsExpress();
            },
        

            // ##############################################################################################################################
            // Misc tools

            getPublicUrl: function(cfg) {
                var publicUrl = url.resolve(baseUrl, cfg.publicPath);
                return publicUrl + (publicUrl.endsWith('/') ? '' : '/');
            },
            
            /**
             * Send all assets of given components to client.
             */
            getClientAssetData: function(componentsOrNames) {
                // re-build and send assets to client (consider caching these bad boys)

                // // get all components by names
                // var components;
                // if　(componentsOrNames.length > 0 && !componentsOrNames.Def) {
                //     // names
                //     components = [];
                //     for (var i = 0; i < componentsOrNames.length; ++i) {
                //         var componentName = componentsOrNames[i];
                //         var component = Shared[componentName];
                //         console.assert(component, 'Invalid component name does not exist: ' + componentName);
                //         components.push(component);
                //     };
                // }
                // else {
                //     // components
                //     components = componentsOrNames;
                // }

                var allAssetData = {
                };
                this.getFileAssets(allAssetData, componentsOrNames);

                return allAssetData;
            },
            
            /**
             * Iterates over all assets of the given category, of all components.
             * It calls the resolver on every such component to get the full name of the resource to be included.
             * It then calls mapper on every uniquely resolved resource.
             */
            forEachAsset: function(category, cb, componentsOrNames, arg) {
                var iterator = function(component) {
                    if (component.Assets && component.Assets[category]) {
                        try {
                            var entry = component.Assets[category];
                            cb(component, entry, arg);
                        }
                        catch (err) {
                            console.error('Cannot parse `Assets.' + category + '` of component `' + component.Def.FullName + '`: ' + err.stack);
                        }
                    }
                };
                
                if (componentsOrNames) {
                    // iterate only over libs & selected components
                    Shared.Libs.forEach(iterator);
                    for (var i = 0; i < componentsOrNames.length; ++i) {
                        var componentOrName = componentsOrNames[i];
                        var component;
                        if (componentOrName.Def) {
                            // is component
                            component = componentOrName;
                        }
                        else {
                            // is name
                            component = Shared[componentOrName];
                            console.assert(component, 'Invalid component name does not exist: ' + componentOrName);
                        }
                        iterator(component);
                    }
                }
                else {
                    // iterate over all components
                    Shared.forEachComponentOfAnyType(iterator);
                }
            },
            
        
            // ##############################################################################################################################
            // AutoIncludes
            
            /**
             * Register paths for clients to download assets by name.
             *
             * TODO: This should not depend on express, and instead be abstracted away by CommunicationComponent.
             */
            _registerAssetPathsExpress: function() {
                // register file server for external files for given component
                var registerPath = function(component, pathRoot) {
                    SharedTools.ExpressRouters.before.get(pathRoot + '*', function(req, res, next) {
                        // get requested file path
                        var requestedPath = req.originalUrl;
                        var fname = requestedPath.substring(pathRoot.length);

                        if (fname.length < 2) {
                            var err = new Error('Illegal file request: ' + requestedPath);
                            err.status = 500;
                            next(error);
                            return;
                        }
                        
                        // try to serve file
                        this.serveFile(component, fname, req, res, next);
                    }.bind(this));
                }.bind(this);

                // register component-relative paths
                Shared.forEachComponentOfAnyType(function(component) {
                    registerPath(component, this.getPublicPath(component && component.Def.FullName));
                }.bind(this));

                // register public path (no component)
                registerPath(null, this.getPublicPath());
            },
            
            /**
             * Get all `AutoIncludes` assets of all components.
             */
            getAutoIncludeAssets: function(assetHandlers) {
                // iterate over and remember all files to be included
                var includeCode = '';
                var allFilesPerCat = {};
                var allFilesPerComponent = this.autoIncludes = {};

                var generateAssetIncludeCode = function(component, autoIncludes, folder) {
                    var componentName = component.Def.FullName;
                    folder = folder || component.Def.Folder;
                    
                    for (var categoryName in autoIncludes) {
                        if (!autoIncludes.hasOwnProperty(categoryName)) continue;
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
                        
                        var filesInCat = autoIncludes[categoryName];
                        for (var i = 0; i < filesInCat.length; ++i) {
                            var fname = filesInCat[i];
                            if (assetHandlers.autoIncludeResolvers && assetHandlers.autoIncludeResolvers[categoryName]) {
                                // fix path (by, eg. appending the correct extension)
                                fname = assetHandlers.autoIncludeResolvers[categoryName](fname);
                            }
                            
                            var relFolder = this.getPublicPath(componentName);
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
                                    var fpath = path.join(folder, fname);
                                    var path1 = fpath.split('?', 1)[0];
                                    if (!fs.existsSync(path1)) {
                                        // file does not exist relative to component:
                                        // check if file exists in public directory
                                        fpath = path.join(pubFolderAbs, fname);
                                        var path2 = fpath.split('?', 1)[0];
                                        if (!fs.existsSync(path2)) {
                                            // cannot find file
                                            throw new Error('Could not find file `' + fname + '` for component `' + component + 
                                                '`. It was located neither relative to the component, nor in the public folder (' +
                                                [folder, pubFolderAbs] + ').');
                                        }
                                    }
                                    allFilesPerComponent[componentName] = allFilesPerComponent[componentName] || (allFilesPerComponent[componentName] = {});
                                    allFilesPerComponent[componentName][fname] = fpath;
                                }
                                includeCode += factory(includeUrl) + '\n';
                            }
                        }
                    }
                }.bind(this);
                
                // add NoGap assets
                var nogapAssetFolder = __dirname + '/../assets/';
                generateAssetIncludeCode(this, this.NoGapIncludes, nogapAssetFolder);

                // add all other assets
                this.forEachAsset('AutoIncludes', generateAssetIncludeCode);

                return includeCode;
            },
            
            /**
             * Try to serve a file from the given request
             */
            serveFile: function(component, fname, req, res, next) {
                fname = fname.split('?', 1)[0];

                var fpath;

                // check if file is an asset for some component
                var componentName = component && component.Def.FullName;
                if (!componentName || !this.autoIncludes[componentName] || !(fpath = this.autoIncludes[componentName][fname])) {
                    // file is not located in component-relative folder, try public folder:
                    fpath = path.join(pubFolderAbs, fname);

                    // make sure, it is a correct path
                    // resolve real path
                    fs.realpath(fpath, function(err, resolvedPath) {
                        // check if file does not exist or has invalid path
                        var errorStatus = (err && 404) || (!resolvedPath.startsWith(pubFolderAbs) && 403);

                        if (!!errorStatus) {
                            err = new Error(err.message);
                            err.status = errorStatus;
                            next(err);
                        }
                        else {
                            // serve file
                            doServeFile(fpath, req, res, next);
                        }
                    });
                    
                    // var err = new Error('Illegal file request: ' + path.join(componentName, fname));
                    // err.status = 500;
                    // next(err);
                    // return;
                }
                else {
                    // this is a previously registed file! -> serve as-is
                    doServeFile(fpath, req, res, next);
                }
            },
        
            // ##############################################################################################################################
            // Files
            
            /**
             * `File`-type assets are maps of key-value pairs, indexed by type name, where each pair denotes 'name: path'.
             * The name is the name under which it will be available in the component's `asset` property and the path tells us where to find it.
             * The type tells us how to treat the data from the file.
             */
            getFileAssets: function(allAssets, componentsOrNames) {
                var allFilesPerCat = {};
                var assetType = 'Files';
            
                // iterate over all external files of all categories in all components:
                var iterator = function(component, files) {
                    var componentName = component.Def.FullName;
                    var compFolder = component.Def.Folder;
                    
                    var assets = allAssets[componentName] = {};
                    
                    for (var categoryName in files) {
                        if (!files.hasOwnProperty(categoryName)) continue;
                        var allFilesInCatInComponent = allFilesPerCat[categoryName];
                        if (!allFilesInCatInComponent) {
                            allFilesPerCat[categoryName] = allFilesInCatInComponent = {};
                        }
                        
                        // iterate over all files in this category, in this component
                        var filesInCat = files[categoryName];
                        for (var assetName in filesInCat) {
                            if (!filesInCat.hasOwnProperty(assetName)) continue;
                            
                            var fname = filesInCat[assetName];
                            
                            var relPath = componentName + '/';
                            var compPath = url.resolve(relPath, fname);
                            var data = allFilesInCatInComponent[compPath];
                            if (!data) {
                                // new file: get it
                                var fpath;
                                if (fs.existsSync(fname)) {
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
                                            throw new Error('Could not find file `' + fname + '` for component `' + component
                                                + '` (in Assets - ' + assetType + '.' + assetName + 
                                                '). It was located neither relative to the component, nor in the public folder.');
                                        }
                                    }
                                }
                                
                                // read file
                                var reader = this.AssetFileReaders[categoryName];
                                if (!reader) {
                                    // asset category does not exist
                                    throw new Error('Component `' + component + '` defined `' + assetType + '` asset `' + assetName + '` with invalid category: `' +
                                        categoryName + '`. Valid categories: ' + Object.keys(this.AssetFileReaders));
                                }
                                allFilesInCatInComponent[compPath] = data = reader(fpath);
                            }
                            
                            if (assets[assetName]) {
                                // defined asset more than once
                                throw new Error('Component `' + component + '` defined `' + assetType + '` asset `' + assetName + '` more than once. ' +
                                    'Each asset name must be unique.');
                            }

                            // remember asset
                            assets[assetName] = {
                                category: categoryName,
                                fileName: fname,
                                data: data
                            };
                        }
                    }
                }.bind(this);

                // iterate over all `File` component assets
                this.forEachAsset(assetType, iterator, componentsOrNames);
            },

            Private: {
                getClientCtorArguments: function() {
                    return [publicUrl];
                },
            }
        };
    }),
    
    Client: ComponentDef.defClient(function(Tools, Instance, Context) {
        return {
            AssetInitializers: {
                /**
                 * Return file content as-is
                 */
                string: function(component, assetName, asset) {
                    return asset.data;
                },

                /**
                 * Run code!
                 *
                 * TODO: Multi-file node modules
                 */
                code: function(component, assetName, asset) {
                    //var virtualFileName = 'NoGap/assets/' + component.Def.FullName + '/' + assetName;
                    if (Tools.requireFromString) {
                        // on Node, use our `require` hack-around
                        var virtualFileName = asset.fileName;
                        return Tools.requireFromString(asset.data, virtualFileName);
                    }
                    else {
                        // else, just eval
                        return eval(asset.data);
                    }
                }
            },

            _installAssets: function(allAssetData) {
                var allAssets = allAssetData;
                for (var componentName in allAssets) {
                    if (!allAssets.hasOwnProperty(componentName)) continue;
                    
                    // get component
                    var component = Instance[componentName];
                    if (!component) {
                        console.warn('Ignored assets for invalid component `' + componentName + '`');
                        continue;
                    }
                    var assets = allAssets[componentName];

                    // add all assets
                    component.assets = {};
                    for (var assetName in assets) {
                        var asset = assets[assetName];
                        var categoryName = asset.category;
                        var initializer = this.AssetInitializers[categoryName];

                        if (!initializer) {
                            console.error('[NoGap INTERNAL ERROR] Could not initialize asset `' + assetName + 
                                '` for Component `' + component + '`. Invalid category has no initializer: ' + categoryName);
                        }
                        else {
                            component.assets[assetName] =  initializer(component, assetName, asset);
                        }
                    }
                }
            },
        

            Public: {
                __ctor: function(publicUrl) {
                    this.publicUrl = publicUrl;
                },

                /**
                 * Initialize all given new assets.
                 */
                initializeClientAssets: function(allAssetData, assetHandlers) {
                    this._installAssets(allAssetData);
                }
            }
        };
    })
});