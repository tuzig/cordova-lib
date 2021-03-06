/**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

var DepGraph = require('dep-graph');
var path = require('path');
var fs = require('fs-extra');
var events = require('cordova-common').events;
var pkg;

module.exports = pkg = {

    generateDependencyInfo: function (platformJson, plugins_dir, pluginInfoProvider) {
        var json = platformJson.root;

        // TODO: store whole dependency tree in plugins/[platform].json
        // in case plugins are forcefully removed...
        var tlps = [];
        var graph = new DepGraph();
        Object.keys(json.installed_plugins).forEach(function (plugin_id) {
            tlps.push(plugin_id);

            var plugin_dir = path.join(plugins_dir, plugin_id);
            var pluginInfo = pluginInfoProvider.get(plugin_dir);
            var deps = pluginInfo.getDependencies(platformJson.platform);
            deps.forEach(function (dep) {
                graph.add(plugin_id, dep.id);
            });
        });
        Object.keys(json.dependent_plugins).forEach(function (plugin_id) {
            var plugin_dir = path.join(plugins_dir, plugin_id);
            // dependency plugin does not exist (CB-7846)
            if (!fs.existsSync(plugin_dir)) {
                events.emit('verbose', 'Plugin "' + plugin_id + '" does not exist (' + plugin_dir + ')');
                return;
            }

            var pluginInfo = pluginInfoProvider.get(plugin_dir);
            var deps = pluginInfo.getDependencies(platformJson.platform);
            deps.forEach(function (dep) {
                graph.add(plugin_id, dep.id);
            });
        });

        return {
            graph: graph,
            top_level_plugins: tlps
        };
    },

    // Returns a list of top-level plugins which are (transitively) dependent on the given plugin.
    dependents: function (plugin_id, plugins_dir, platformJson, pluginInfoProvider) {
        var depsInfo;
        if (typeof plugins_dir === 'object') { depsInfo = plugins_dir; } else { depsInfo = pkg.generateDependencyInfo(platformJson, plugins_dir, pluginInfoProvider); }

        var graph = depsInfo.graph;
        var tlps = depsInfo.top_level_plugins;
        var dependents = tlps.filter(function (tlp) {
            return tlp !== plugin_id && graph.getChain(tlp).indexOf(plugin_id) >= 0;
        });

        return dependents;
    },

    // Returns a list of plugins which the given plugin depends on, for which it is the only dependent.
    // In other words, if the given plugin were deleted, these dangling dependencies should be deleted too.
    danglers: function (plugin_id, plugins_dir, platformJson, pluginInfoProvider) {
        var depsInfo;
        if (typeof plugins_dir === 'object') { depsInfo = plugins_dir; } else { depsInfo = pkg.generateDependencyInfo(platformJson, plugins_dir, pluginInfoProvider); }

        const { graph, top_level_plugins } = depsInfo;

        // get plugin_id's dependencies
        const dependencies = graph.getChain(plugin_id);

        // Calculate the set of all top-level plugins and their transitive dependencies
        const otherTlps = top_level_plugins.filter(tlp => tlp !== plugin_id);
        const otherTlpDeps = otherTlps.map(tlp => graph.getChain(tlp));
        const remainingPlugins = new Set(otherTlps.concat(...otherTlpDeps));

        // dependencies - remainingPlugins
        return dependencies.filter(p => !remainingPlugins.has(p));
    }
};
