/*
 * Copyright 2014 XWiki SAS
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */
define([
    '/common/common-util.js',
    '/customize/application_config.js',
    '/bower_components/chainpad/chainpad.dist.js'
], function (Util, AppConfig) {
    var ChainPad = window.ChainPad;
    var module = { exports: {} };

    var badStateTimeout = typeof(AppConfig.badStateTimeout) === 'number' ?
        AppConfig.badStateTimeout : 30000;

    var verbose = function (x) { console.log(x); };
    verbose = function () {}; // comment out to enable verbose logging

    module.exports.start = function (config) {
        var onConnectionChange = config.onConnectionChange || function () { };
        var onRemote = config.onRemote || function () { };
        var onInit = config.onInit || function () { };
        var onLocal = config.onLocal || function () { };
        var setMyID = config.setMyID || function () { };
        var onReady = config.onReady || function () { };
        var userName = config.userName;
        var initialState = config.initialState;
        var transformFunction = config.transformFunction;
        var validateContent = config.validateContent;
        var avgSyncMilliseconds = config.avgSyncMilliseconds;
        var logLevel = typeof(config.logLevel) !== 'undefined'? config.logLevel : 1;
        var readOnly = config.readOnly || false;
        var sframeChan = config.sframeChan;
        var metadataMgr = config.metadataMgr;
        config = undefined;

        var chainpad;
        var myID;
        var isReady = false;
        var evConnected = Util.mkEvent(true);
        var evInfiniteSpinner = Util.mkEvent(true);

        window.setInterval(function () {
            if (!chainpad || !myID) { return; }
            var l;
            try {
                l = chainpad.getLag();
            } catch (e) {
                throw new Error("ChainPad.getLag() does not exist, please `bower update`");
            }
            if (l.lag < badStateTimeout) { return; }
            chainpad.abort();
            evInfiniteSpinner.fire();
        }, 2000);

        sframeChan.on('EV_RT_DISCONNECT', function () {
            isReady = false;
            if (chainpad) { chainpad.abort(); }
            onConnectionChange({ state: false });
        });
        sframeChan.on('EV_RT_CONNECT', function (content) {
            //content.members.forEach(userList.onJoin);
            myID = content.myID;
            isReady = false;
            if (chainpad) {
                // it's a reconnect
                if (chainpad) { chainpad.start(); }
                onConnectionChange({ state: true, myId: myID });
                return;
            }
            chainpad = ChainPad.create({
                userName: userName,
                initialState: initialState,
                transformFunction: transformFunction,
                validateContent: validateContent,
                avgSyncMilliseconds: avgSyncMilliseconds,
                logLevel: logLevel
            });
            chainpad.onMessage(function(message, cb) {
                sframeChan.query('Q_RT_MESSAGE', message, cb);
            });
            chainpad.onPatch(function () {
                onRemote({ realtime: chainpad });
            });
            onInit({
                myID: myID,
                realtime: chainpad,
                readOnly: readOnly
            });
            evConnected.fire();
        });
        sframeChan.on('Q_RT_MESSAGE', function (content, cb) {
            if (isReady) {
                onLocal(); // should be onBeforeMessage
            }
            chainpad.message(content);
            cb('OK');
        });
        sframeChan.on('EV_RT_READY', function () {
            if (isReady) { return; }
            isReady = true;
            chainpad.start();
            setMyID({ myID: myID });
            onReady({ realtime: chainpad });
        });

        var whenRealtimeSyncs = function (cb) {
            evConnected.reg(function () {
                if (chainpad.getAuthDoc() === chainpad.getUserDoc()) {
                    return void cb();
                } else {
                    chainpad.onSettle(cb);
                }
            });
        };

        return Object.freeze({
            getMyID: function () { return myID; },
            metadataMgr: metadataMgr,
            whenRealtimeSyncs: whenRealtimeSyncs,
            onInfiniteSpinner: evInfiniteSpinner.reg
        });
    };
    return Object.freeze(module.exports);
});