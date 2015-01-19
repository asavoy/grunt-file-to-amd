'use strict';


var logInspect = function(obj) {
    console.log(util.inspect(obj, {
        colors: true,
        showHidden: true,
        depth: null
    }));
};


function transformSource(source, convertMap, convertExtensionsToPlugins) {


    // Takes a StealJS dependency name and converts to a RequireJS dependency
    // name.
    var convertToRequireJSDependency = function(name) {
        // Special cases.
        if (convertMap[name]) {
            return convertMap[name];
        }
        // Change any modules to use plugins.
        // e.g. "views/page.mustache!" => "mustache!views/page.mustache".
        for (var extension in convertExtensionsToPlugins) {
            var plugin = convertExtensionsToPlugins[extension];
            // Does name end with extension?
            if (name.slice(-extension.length) === extension) {
                return plugin + name.replace('!', '');
            }
        }
        // Change "path/name.js" => "path/name".
        // Does name end with ".js"?
        var jsExtension = '.js';
        if (name.slice(-jsExtension.length) === jsExtension) {
            return name.replace('.js', '');
        }
        // No change for relative paths: "./path/name" => "./path/name"
        var relativePrefix = './';
        var pluginSuffix = '!';
        // Does name start with a relative path?
        if (name.slice(0, relativePrefix.length) === relativePrefix) {
            // Does it not use a plugin?
            if (name.slice(-pluginSuffix.length) !== pluginSuffix) {
                return name;
            }
        }
        // Lastly, change "path/name" => "path/name/name".
        var depParts = name.split('/');
        depParts.push(depParts[depParts.length - 1]);
        return depParts.join('/');
    };

    var headerRegex = new RegExp(
        '(steal\\()([^]+?)(function)', // [^] == . that match newlines too
        'm'
    );
    var depsRegex = new RegExp(
        '([\'"])([^\'", ]+)([\'"])', 'mg'
    );
    source = source.replace(headerRegex, function(match, p1, p2, p3) {
        p2 = p2.replace(depsRegex, function(match, p1_, p2_, p3_) {
            return p1_ + convertToRequireJSDependency(p2_) + p3_;
        });
        if (p2.indexOf(',') !== -1) {
            var bits = p2.split(',');
            if (bits[bits.length - 1].trim() === '') {
                bits[bits.length - 2] += bits[bits.length - 1];
                bits.pop();
            }
            p2 = bits.join(',');
        }
        return 'require([' + p2 + '], function';
    });
    if (source.indexOf('steal/steal.js?') !== -1) {
        var mainRegex = new RegExp(
            '(steal/steal\\.js)[?]([^\'"]+)([\'"])'
        );
        source = source.replace(mainRegex, function(match, p1, p2, q) {
            var main = convertToRequireJSDependency(p2);
            return p1 + q + " data-main=" + q + main + q;
        });
    }
    source = source.replace('steal/steal.js', 'require-load.js');

    return source;

}


module.exports = function(grunt) {

    grunt.registerMultiTask(
        'fileToAmd',
        'Rewrite StealJS pages into AMD',
        function() {
            // Merge task-specific and/or target-specific options with these
            // defaults.
            var options = this.options({
                convertExtensionsToPlugins: {
                    '.css!': 'css!',
                    '.ejs!': 'ejs!',
                    '.mustache!': 'mustache!',
                    '.stache!': 'stache!'
                },
                convertMap: {
                    'can': 'can',
                    'can/component': 'can/component',
                    'can/compute': 'can/compute',
                    'can/construct': 'can/construct',
                    'can/construct/proxy': 'can/construct/proxy',
                    'can/construct/super': 'can/construct/super',
                    'can/control': 'can/control',
                    'can/control/plugin': 'can/control/plugin',
                    'can/control/route': 'can/control/route',
                    'can/control/view': 'can/control/view',
                    'can/list': 'can/list',
                    'can/list/promise': 'can/list/promise',
                    'can/map': 'can/map',
                    'can/map/sort': 'can/map/sort',
                    'can/map/attributes': 'can/map/attributes',
                    'can/map/define': 'can/map/define',
                    'can/map/delegate': 'can/map/delegate',
                    'can/map/elements': 'can/map/elements',
                    'can/model': 'can/model',
                    'can/model/list': 'can/model/list',
                    'can/observe': 'can/observe',
                    'can/observe/backup': 'can/observe/backup',
                    'can/observe/validations': 'can/observe/validations',
                    'can/route': 'can/route',
                    'can/view': 'can/view',
                    'can/view/bindings': 'can/view/bindings',
                    'can/view/ejs': 'can/view/ejs',
                    'can/view/live': 'can/view/live',
                    'can/view/micro': 'can/view/micro',
                    'can/view/modifiers': 'can/view/modifiers',
                    'can/view/mustache': 'can/view/mustache',
                    // NOTE: Have to map this to can/util/jquery, or submodules
                    //       paths will break.
                    'can/util': 'can/util/jquery',
                    'can/util/array/makeArray.js': 'can/util/array/makeArray.js',
                    'can/util/fixture': 'can/util/fixture',
                    'can/util/string/deparam': 'can/util/string/deparam',
                    'jquery': 'jquery',
                    'funcunit': 'funcunit',
                    'funcunit/qunit': 'qunit'
                },
                ignorePaths: [
                    'src/can/',
                    'src/documentjs/',
                    'src/funcunit/',
                    'src/steal/'
                ],
                maxFiles: null
            });

            // Iterate over each file.
            var filesCompleted = 0;
            this.files.forEach(function(file) {
                file.src.forEach(function(filePath) {
                    // To limit processing to first N files.
                    if (options.maxFiles && (filesCompleted > options.maxFiles)) {
                        return;
                    }
                    // Ignore files that match ignorePaths.
                    for (var i=0; i<options.ignorePaths.length; i++) {
                        var ignorePath = options.ignorePaths[i];
                        // Does filePath start with ignorePath?
                        if (filePath.slice(0, ignorePath.length) === ignorePath) {
                            grunt.log.writeln('Ignoring: ' + filePath);
                            return;
                        }
                    }
                    var content = grunt.file.read(filePath);
                    // Ignore files without "steal/steal.js" in it.
                    if (content.indexOf('steal/steal.js') === -1) {
                        grunt.log.writeln('Ignoring: ' + filePath);
                    }
                    // Transform source for each file.
                    grunt.log.writeln('Processing: ' + filePath);
                    var newContent = transformSource(
                        content,
                        options.convertMap,
                        options.convertExtensionsToPlugins
                    );
                    // Overwrite the original file.
                    grunt.file.write(filePath, newContent);
                    filesCompleted += 1;
                });
            });

        });
};
