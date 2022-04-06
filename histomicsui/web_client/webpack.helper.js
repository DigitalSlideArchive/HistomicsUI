const path = require('path');

const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = function (config) {
    config.plugins.push(
        new CopyWebpackPlugin([{
            from: path.join(path.resolve(__dirname), 'static'),
            to: config.output.path,
            toType: 'dir'
        }, {
            from: path.join(path.resolve(__dirname), 'node_modules', 'sinon', 'pkg', 'sinon.js'),
            to: path.join(config.output.path, 'extra', 'sinon.js')
        }])
    );
    return config;
};
