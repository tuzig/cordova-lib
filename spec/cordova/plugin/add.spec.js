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
// TODO: remove once eslint lands
/* eslint-env jasmine */
/* globals fail */

var Q = require('q');
var rewire = require('rewire');
var add = rewire('../../../src/cordova/plugin/add');
var plugman = require('../../../src/plugman/plugman');
var cordova_util = require('../../../src/cordova/util');
var path = require('path');
var fs = require('fs');
var config = require('../../../src/cordova/config');
var events = require('cordova-common').events;
var registry = require('../../../src/plugman/registry/registry');
var plugin_util = require('../../../src/cordova/plugin/util');

describe('cordova/plugin/add', function () {
    var projectRoot = '/some/path';
    var hook_mock;
    var Cfg_parser_mock = function () {};
    var cfg_parser_revert_mock;
    var plugin_info_provider_mock = function () {};
    var plugin_info_provider_revert_mock;
    var plugin_info;
    var package_json_mock;

    beforeEach(function () {
        hook_mock = jasmine.createSpyObj('hooks runner mock', ['fire']);
        hook_mock.fire.and.returnValue(Q());
        Cfg_parser_mock.prototype = jasmine.createSpyObj('config parser prototype mock', ['getPlugin', 'removePlugin', 'addPlugin', 'write']);
        /* eslint-disable */
        Cfg_parser_mock.prototype.getPlugin;
        Cfg_parser_mock.prototype.removePlugin;
        Cfg_parser_mock.prototype.addPlugin;
        Cfg_parser_mock.prototype.write;
        /* eslint-enable */
        cfg_parser_revert_mock = add.__set__('ConfigParser', Cfg_parser_mock);
        plugin_info = jasmine.createSpyObj('pluginInfo', ['getPreferences']);
        plugin_info.getPreferences.and.returnValue({});
        plugin_info.dir = 'some\\plugin\\path';
        plugin_info.id = 'cordova-plugin-device';
        plugin_info.version = '1.0.0';
        plugin_info_provider_mock.prototype = jasmine.createSpyObj('plugin info provider mock', ['get']);
        plugin_info_provider_mock.prototype.get = function (directory) {
            // id version dir getPreferences() engines engines.cordovaDependencies name versions
            return plugin_info;
        };
        plugin_info_provider_revert_mock = add.__set__('PluginInfoProvider', plugin_info_provider_mock);
        spyOn(fs, 'existsSync').and.returnValue(false);
        spyOn(fs, 'writeFileSync').and.returnValue(false);
        package_json_mock = jasmine.createSpyObj('package json mock', ['cordova', 'dependencies']);
        package_json_mock.cordova = {};
        package_json_mock.dependencies = {};
        // requireNoCache is used to require package.json
        spyOn(cordova_util, 'requireNoCache').and.returnValue(package_json_mock);
        spyOn(events, 'emit');
        spyOn(registry, 'info').and.returnValue(Q());
        spyOn(add, 'getFetchVersion').and.returnValue(Q());
        spyOn(plugin_util, 'saveToConfigXmlOn').and.returnValue(true);
    });
    afterEach(function () {
        cfg_parser_revert_mock();
        plugin_info_provider_revert_mock();
    });
    describe('main method', function () {

        beforeEach(function () {
            spyOn(add, 'determinePluginTarget').and.callFake(function (projRoot, cfg, target, opts) {
                return Q(target);
            });
            spyOn(plugman, 'fetch').and.callFake(function (target, pluginPath, opts) {
                return Q(target);
            });
            spyOn(plugman, 'install').and.returnValue(Q(true));
            spyOn(cordova_util, 'listPlatforms').and.callFake(function () {
                return ['android'];
            });
            spyOn(cordova_util, 'findPlugins').and.returnValue({plugins: []});
            spyOn(config, 'read').and.returnValue({});
        });
        describe('error/warning conditions', function () {
            it('should error out if at least one plugin is not specified', function (done) {
                add(projectRoot, hook_mock, {plugins: []}).then(function () {
                    fail('success handler unexpectedly invoked');
                }).fail(function (e) {
                    expect(e.message).toContain('No plugin specified');
                }).done(done);
            });
            it('should error out if any mandatory plugin variables are not provided', function (done) {
                plugin_info.getPreferences.and.returnValue({'some': undefined});

                add(projectRoot, hook_mock, {plugins: ['cordova-plugin-device']}).then(function () {
                    fail('success handler unexpectedly invoked');
                }).fail(function (e) {
                    expect(e.message).toContain('Variable(s) missing (use: --variable');
                }).done(done);
            });
        });
        describe('happy path', function () {
            it('should fire the before_plugin_add hook', function (done) {
                add(projectRoot, hook_mock, {plugins: ['https://github.com/apache/cordova-plugin-device'], save: true}).then(function () {
                    expect(hook_mock.fire).toHaveBeenCalledWith('before_plugin_add', jasmine.any(Object));
                }).fail(function (e) {
                    fail('fail handler unexpectedly invoked');
                    console.log(e);
                }).done(done);
            });
            it('should determine where to fetch a plugin from using determinePluginTarget and invoke plugman.fetch with the resolved target', function (done) {
                add(projectRoot, hook_mock, {plugins: ['cordova-plugin-device']}).then(function () {
                    expect(add.determinePluginTarget).toHaveBeenCalledWith(projectRoot, jasmine.any(Object), 'cordova-plugin-device', jasmine.any(Object));
                    expect(plugman.fetch).toHaveBeenCalledWith('cordova-plugin-device', path.join(projectRoot, 'plugins'), jasmine.any(Object));
                }).fail(function (e) {
                    fail('fail handler unexpectedly invoked');
                    console.log(e);
                }).done(done);
            });
            it('should retrieve any variables for the plugin from config.xml and add them as cli variables only when the variables were not already provided via options', function (done) {
                var cfg_plugin_variables = {'some': 'variable'};
                Cfg_parser_mock.prototype.getPlugin.and.callFake(function (plugin_id) {
                    return {'variables': cfg_plugin_variables};
                });
                add(projectRoot, hook_mock, {plugins: ['cordova-plugin-device']}).then(function () {
                    // confirm cli_variables are undefind
                    expect(add.determinePluginTarget).toHaveBeenCalledWith(jasmine.anything(), jasmine.anything(), jasmine.anything(), jasmine.objectContaining({'variables': undefined}));
                    expect(plugman.install).toHaveBeenCalled();
                    // check that the plugin variables from config.xml got added to cli_variables
                    expect(plugman.install).toHaveBeenCalledWith(jasmine.anything(), jasmine.anything(), jasmine.anything(), jasmine.anything(), jasmine.objectContaining({'cli_variables': cfg_plugin_variables}));
                }).fail(function (e) {
                    fail('fail handler unexpectedly invoked');
                    console.log(e);
                }).done(done);
            });
            it('should invoke plugman.install for each platform added to the project', function (done) {
                add(projectRoot, hook_mock, {plugins: ['cordova-plugin-device']}).then(function () {
                    expect(plugman.install).toHaveBeenCalledWith('android', jasmine.any(String), jasmine.any(String), jasmine.any(String), jasmine.any(Object));
                }).fail(function (e) {
                    fail('fail handler unexpectedly invoked');
                    console.log(e);
                }).done(done);
            });
            it('should save plugin variable information to package.json file (if exists)', function (done) {
                var cli_plugin_variables = {'some': 'variable'};

                fs.existsSync.and.callFake(function (file_path) {
                    if (path.basename(file_path) === 'package.json') {
                        return true;
                    } else {
                        return false;
                    }
                });

                spyOn(fs, 'readFileSync').and.returnValue('file');
                add(projectRoot, hook_mock, {plugins: ['cordova-plugin-device'], cli_variables: cli_plugin_variables, save: 'true'}).then(function () {
                    expect(fs.writeFileSync).toHaveBeenCalledWith(jasmine.any(String), JSON.stringify({'cordova': {'plugins': {'cordova-plugin-device': cli_plugin_variables}}, 'dependencies': {}}, null, 2), 'utf8');
                }).fail(function (e) {
                    fail('fail handler unexpectedly invoked');
                    console.log(e);
                }).done(done);
            });
            it('should overwrite plugin information in config.xml after a successful installation', function (done) {
                var cfg_plugin_variables = {'some': 'variable'};
                var cli_plugin_variables = {'some': 'new_variable'};
                Cfg_parser_mock.prototype.getPlugin.and.callFake(function (plugin_id) {
                    return {'variables': cfg_plugin_variables};
                });

                add(projectRoot, hook_mock, {plugins: ['cordova-plugin-device'], cli_variables: cli_plugin_variables, save: 'true'}).then(function () {
                    // confirm cli_variables got passed through
                    expect(add.determinePluginTarget).toHaveBeenCalledWith(jasmine.anything(), jasmine.anything(), jasmine.anything(), jasmine.objectContaining({'variables': cli_plugin_variables}));
                    // check that the plugin variables from config.xml got added to cli_variables
                    expect(plugman.install).toHaveBeenCalledWith(jasmine.anything(), jasmine.anything(), jasmine.anything(), jasmine.anything(), jasmine.objectContaining({'cli_variables': cli_plugin_variables}));
                    expect(Cfg_parser_mock.prototype.removePlugin).toHaveBeenCalledWith('cordova-plugin-device');
                    expect(Cfg_parser_mock.prototype.addPlugin).toHaveBeenCalledWith(jasmine.any(Object), cli_plugin_variables);
                    expect(Cfg_parser_mock.prototype.write).toHaveBeenCalled();
                }).fail(function (e) {
                    fail('fail handler unexpectedly invoked');
                    console.log(e);
                }).done(done);
            });
            // can't test the following due to inline require of preparePlatforms
            xit('should invoke preparePlatforms if plugman.install returned a falsey value', function () {
                plugman.install.and.returnValue(false);
            });
            it('should fire after_plugin_add hook', function (done) {
                add(projectRoot, hook_mock, {plugins: ['cordova-plugin-device']}).then(function () {
                    expect(hook_mock.fire).toHaveBeenCalledWith('after_plugin_add', jasmine.any(Object));
                }).fail(function (e) {
                    fail('fail handler unexpectedly invoked');
                    console.log(e);
                }).done(done);
            });
        });
    });
    describe('determinePluginTarget helper method', function () {
        beforeEach(function () {
            spyOn(cordova_util, 'isDirectory').and.returnValue(false);
            spyOn(add, 'getVersionFromConfigFile').and.returnValue(undefined);
            package_json_mock.dependencies['cordova-plugin-device'] = undefined;
        });
        afterEach(function () {
        });
        it('should return the target directly if the target is pluginSpec-parseable', function (done) {
            add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device@1.0.0', {}).then(function (target) {
                expect(target).toEqual('cordova-plugin-device@1.0.0');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        it('should return the target directly if the target is a URL', function (done) {
            add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'https://github.com/apache/cordova-plugin-device.git', {}).then(function (target) {
                expect(target).toEqual('https://github.com/apache/cordova-plugin-device.git');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        it('should return the target directly if the target is a directory', function (done) {
            cordova_util.isDirectory.and.returnValue(true);
            add.determinePluginTarget(projectRoot, Cfg_parser_mock, '../some/dir/cordova-plugin-device', {}).then(function (target) {
                expect(target).toEqual('../some/dir/cordova-plugin-device');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        it('should retrieve plugin version from package.json (if exists)', function (done) {
            fs.existsSync.and.callFake(function (file_path) {
                if (path.basename(file_path) === 'package.json') {
                    return true;
                } else {
                    return false;
                }
            });

            package_json_mock.dependencies['cordova-plugin-device'] = '^1.0.0';

            add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {}).then(function (target) {
                expect(target).toEqual('cordova-plugin-device@^1.0.0');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        it('should retrieve plugin version from config.xml as a last resort', function (done) {
            add.getVersionFromConfigFile.and.returnValue('~1.0.0');
            add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {}).then(function (target) {
                expect(add.getVersionFromConfigFile).toHaveBeenCalled();
                expect(target).toEqual('cordova-plugin-device@~1.0.0');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        it('should return plugin version retrieved from package.json or config.xml if it is a URL', function (done) {
            fs.existsSync.and.callFake(function (file_path) {
                if (path.basename(file_path) === 'package.json') {
                    return true;
                } else {
                    return false;
                }
            });

            package_json_mock.dependencies['cordova-plugin-device'] = 'https://github.com/apache/cordova-plugin-device.git';

            add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {}).then(function (target) {
                expect(target).toEqual('https://github.com/apache/cordova-plugin-device.git');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        it('should return plugin version retrieved from package.json or config.xml if it is a directory', function (done) {
            fs.existsSync.and.callFake(function (file_path) {
                if (path.basename(file_path) === 'package.json') {
                    return true;
                } else {
                    return false;
                }
            });
            cordova_util.isDirectory.and.callFake(function (dir) {
                if (dir === '../some/dir/cordova-plugin-device') {
                    return true;
                }
                return false;
            });
            package_json_mock.dependencies['cordova-plugin-device'] = '../some/dir/cordova-plugin-device';

            add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {}).then(function (target) {
                expect(target).toEqual('../some/dir/cordova-plugin-device');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        it('should return plugin version retrieved from package.json or config.xml if it has a scope', function (done) {
            fs.existsSync.and.callFake(function (file_path) {
                if (path.basename(file_path) === 'package.json') {
                    return true;
                } else {
                    return false;
                }
            });

            package_json_mock.dependencies['@cordova/cordova-plugin-device'] = '^1.0.0';

            add.determinePluginTarget(projectRoot, Cfg_parser_mock, '@cordova/cordova-plugin-device', {}).then(function (target) {
                expect(target).toEqual('@cordova/cordova-plugin-device@^1.0.0');
            }).fail(function (e) {
                fail('fail handler unexpectedly invoked');
                console.log(e);
            }).done(done);
        });
        describe('with no version inferred from config files or provided plugin target', function () {
            describe('when searchpath or noregistry flag is provided', function () {
                it('should end up just returning the target passed in case of searchpath', function (done) {
                    add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {'searchpath': 'some/path'})
                        .then(function (target) {
                            expect(target).toEqual('cordova-plugin-device');
                            expect(events.emit).toHaveBeenCalledWith('verbose', 'Not checking npm info for cordova-plugin-device because searchpath or noregistry flag was given');
                        }).fail(function (e) {
                            fail('fail handler unexpectedly invoked');
                            console.log(e);
                        }).done(done);
                });
                it('should end up just returning the target passed in case of noregistry', function (done) {
                    add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {'noregistry': true})
                        .then(function (target) {
                            expect(target).toEqual('cordova-plugin-device');
                            expect(events.emit).toHaveBeenCalledWith('verbose', 'Not checking npm info for cordova-plugin-device because searchpath or noregistry flag was given');
                        }).fail(function (e) {
                            fail('fail handler unexpectedly invoked');
                            console.log(e);
                        }).done(done);
                });
            });
            describe('when registry/npm is to be used (neither searchpath nor noregistry flag is provided)', function () {
                it('should retrieve plugin info via registry.info', function (done) {
                    add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {})
                        .then(function (target) {
                            expect(registry.info).toHaveBeenCalledWith(['cordova-plugin-device'], '/some/path', jasmine.any(Object));
                            expect(events.emit).toHaveBeenCalledWith('verbose', 'Attempting to use npm info for cordova-plugin-device to choose a compatible release');
                            expect(target).toEqual('cordova-plugin-device');
                        }).fail(function (e) {
                            fail('fail handler unexpectedly invoked');
                            console.log(e);
                        }).done(done);
                });
                it('should feed registry.info plugin information into getFetchVersion', function (done) {
                    registry.info.and.returnValue(Q({'plugin': 'info'}));
                    add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {})
                        .then(function (target) {
                            expect(registry.info).toHaveBeenCalled();
                            expect(add.getFetchVersion).toHaveBeenCalledWith(jasmine.anything(), {'plugin': 'info'}, jasmine.anything());
                            expect(target).toEqual('cordova-plugin-device');
                            expect(events.emit).toHaveBeenCalledWith('verbose', 'Attempting to use npm info for cordova-plugin-device to choose a compatible release');
                        }).fail(function (e) {
                            fail('fail handler unexpectedly invoked');
                            console.log(e);
                        }).done(done);
                });
                it('should return the target as plugin-id@fetched-version', function (done) {
                    add.getFetchVersion.and.returnValue(Q('1.0.0'));
                    add.determinePluginTarget(projectRoot, Cfg_parser_mock, 'cordova-plugin-device', {})
                        .then(function (target) {
                            expect(registry.info).toHaveBeenCalled();
                            expect(add.getFetchVersion).toHaveBeenCalled();
                            expect(target).toEqual('cordova-plugin-device@1.0.0');
                            expect(events.emit).toHaveBeenCalledWith('verbose', 'Attempting to use npm info for cordova-plugin-device to choose a compatible release');
                        }).fail(function (e) {
                            fail('fail handler unexpectedly invoked');
                            console.log(e);
                        }).done(done);
                });
            });
        });
    });
    describe('parseSource helper method', function () {
        it('should return target when url is passed', function (done) {
            expect(add.parseSource('https://github.com/apache/cordova-plugin-device', {})).toEqual('https://github.com/apache/cordova-plugin-device');
            done();
        });
        it('should return target when local path is passed', function (done) {
            fs.existsSync.and.returnValue(true);
            expect(add.parseSource('../cordova-plugin-device', {})).toEqual('../cordova-plugin-device');
            done();
        });
        it('should return null when target is not url or local path', function (done) {
            expect(add.parseSource('cordova-plugin-device', {})).toEqual(null);
            done();
        });
    });
    describe('getVersionFromConfigFile helper method', function () {
        it('should return spec', function (done) {
            var fakePlugin = {};
            fakePlugin.name = '';
            fakePlugin.spec = '1.0.0';
            fakePlugin.variables = {};

            Cfg_parser_mock.prototype.getPlugin.and.returnValue(fakePlugin);
            var new_cfg = new Cfg_parser_mock();
            expect(add.getVersionFromConfigFile('cordova-plugin-device', new_cfg)).toEqual('1.0.0');
            done();
        });
    });

    // TODO: reorganize these tests once the logic here is understood! -filmaj
    // TODO: rewrite the tests from integration-tests/plugin_fetch.spec.js to here.
    describe('unit tests to replace integration-tests/plugin_fetch.spec.js', function () {
        describe('getFetchVersion helper method', function () {
            var pluginInfo;

            beforeEach(function () {
                add.getFetchVersion.and.callThrough();
                pluginInfo = {};
                spyOn(plugin_util, 'getInstalledPlugins').and.returnValue([]);
                spyOn(cordova_util, 'getInstalledPlatformsWithVersions').and.returnValue(Q({}));
                spyOn(add, 'determinePluginVersionToFetch');
            });
            it('should resolve with null if plugin info does not contain engines and engines.cordovaDependencies properties', function (done) {
                add.getFetchVersion(projectRoot, pluginInfo, '7.0.0')
                    .then(function (value) {
                        expect(value).toBe(null);
                    }).fail(function (e) {
                        fail('fail handler unexpectedly invoked');
                        console.log(e);
                    }).done(done);
            });
            it('should retrieve installed plugins and installed platforms version and feed that information into determinePluginVersionToFetch', function (done) {
                plugin_util.getInstalledPlugins.and.returnValue([{'id': 'cordova-plugin-camera', 'version': '2.0.0'}]);
                cordova_util.getInstalledPlatformsWithVersions.and.returnValue(Q({'android': '6.0.0'}));
                pluginInfo.engines = {};
                pluginInfo.engines.cordovaDependencies = {'^1.0.0': {'cordova': '>7.0.0'}};
                add.getFetchVersion(projectRoot, pluginInfo, '7.0.0')
                    .then(function () {
                        expect(plugin_util.getInstalledPlugins).toHaveBeenCalledWith(projectRoot);
                        expect(cordova_util.getInstalledPlatformsWithVersions).toHaveBeenCalledWith(projectRoot);
                        expect(add.determinePluginVersionToFetch).toHaveBeenCalledWith(pluginInfo, {'cordova-plugin-camera': '2.0.0'}, {'android': '6.0.0'}, '7.0.0');
                    }).fail(function (e) {
                        fail('fail handler unexpectedly invoked');
                        console.log(e);
                    }).done(done);
            });
        });
        // TODO More work to be done here to replace plugin_fetch.spec.js
        describe('determinePluginVersionToFetch helper method', function () {
            var pluginInfo;
            beforeEach(function () {
                pluginInfo = {};
                pluginInfo.name = 'cordova-plugin-device';
                pluginInfo.versions = ['0.1.0', '1.0.0', '1.5.0', '2.0.0'];
                spyOn(add, 'getFailedRequirements').and.returnValue([]);
                spyOn(add, 'findVersion').and.returnValue(null);
                spyOn(add, 'listUnmetRequirements');
            });
            it('should return null if no valid semver versions exist and no upperbound constraints were placed', function (done) {
                pluginInfo.engines = {};
                pluginInfo.engines.cordovaDependencies = {'^1.0.0': {'cordova': '<7.0.0'}};
                expect(add.determinePluginVersionToFetch(pluginInfo, {}, {}, '7.0.0')).toBe(null);
                expect(events.emit).toHaveBeenCalledWith('verbose', jasmine.stringMatching(/Ignoring invalid version/));
                done();
            });
            it('should return null and fetching latest version of plugin', function (done) {
                add.getFailedRequirements.and.returnValue(['2.0.0']);
                pluginInfo.engines = {};
                pluginInfo.engines.cordovaDependencies = {'1.0.0': {'cordova': '<7.0.0'}, '<3.0.0': {'cordova': '>=7.0.0'}};
                expect(add.determinePluginVersionToFetch(pluginInfo, {}, {}, '7.0.0')).toBe(null);
                expect(events.emit).toHaveBeenCalledWith('warn', jasmine.stringMatching(/Current project does not satisfy/));
                done();
            });
            it('should return highest version of plugin available based on constraints', function (done) {
                pluginInfo.engines = {};
                pluginInfo.engines.cordovaDependencies = {'1.0.0': {'cordova': '<7.0.0'}, '<3.0.0': {'cordova': '>=7.0.0'}};
                expect(add.determinePluginVersionToFetch(pluginInfo, {}, {}, '7.0.0')).toEqual('2.0.0');
                done();
            });
        });
        describe('getFailedRequirements helper method', function () {
            it('should remove prerelease version', function (done) {
                var semver = require('semver');
                spyOn(semver, 'prerelease').and.returnValue('7.0.1');
                spyOn(semver, 'inc').and.callThrough();
                expect(add.getFailedRequirements({'cordova': '>=7.0.0'}, {}, {}, '7.0.0').length).toBe(0);
                expect(semver.inc).toHaveBeenCalledWith('7.0.0', 'patch');
                done();
            });
            it('should return an empty array if no failed requirements', function (done) {
                expect(add.getFailedRequirements({'cordova': '>=7.0.0'}, {}, {}, '7.0.0').length).toBe(0);
                done();
            });
            it('should return an empty array if invalid dependency constraint', function (done) {
                expect(add.getFailedRequirements({1: 'wrong'}, {}, {}, '7.0.0').length).toBe(0);
                expect(events.emit).toHaveBeenCalledWith('verbose', jasmine.stringMatching(/Ignoring invalid plugin dependency constraint/));
                done();
            });
            it('should return an array with failed plugin requirements ', function (done) {
                expect(add.getFailedRequirements({'cordova-plugin-camera': '>1.0.0'}, {'cordova-plugin-camera': '1.0.0'}, {}, '7.0.0')).toEqual([{ dependency: 'cordova-plugin-camera', installed: '1.0.0', required: '>1.0.0' }]);
                done();
            });
            it('should return an array with failed cordova requirements ', function (done) {
                expect(add.getFailedRequirements({'cordova': '>=7.0.0'}, {}, {}, '6.5.0')).toEqual([{ dependency: 'cordova', installed: '6.5.0', required: '>=7.0.0' }]);
                done();
            });
            it('should return an array with failed platform requirements ', function (done) {
                expect(add.getFailedRequirements({'cordova-android': '>=6.0.0'}, {}, {'android': '5.5.0'}, '7.0.0')).toEqual([{ dependency: 'cordova-android', installed: '5.5.0', required: '>=6.0.0' }]);
                done();
            });
        });
        describe('listUnmetRequirements helper method', function () {
            it('should emit warnings for failed requirements', function (done) {
                add.listUnmetRequirements('cordova-plugin-device', [{ dependency: 'cordova', installed: '6.5.0', required: '>=7.0.0' }]);
                expect(events.emit).toHaveBeenCalledWith('warn', 'Unmet project requirements for latest version of cordova-plugin-device:');
                expect(events.emit).toHaveBeenCalledWith('warn', '    cordova (6.5.0 in project, >=7.0.0 required)');
                done();
            });
        });
        describe('findVersion helper method', function () {
            it('should return null if version is not in array', function (done) {
                expect(add.findVersion(['0.0.1', '1.0.0', '2.0.0'], '0.0.0')).toEqual(null);
                done();
            });
            it('should return the version if it is in the array', function (done) {
                expect(add.findVersion(['0.0.1', '1.0.0', '2.0.0'], '1.0.0')).toEqual('1.0.0');
                done();
            });
        });
    });
});
