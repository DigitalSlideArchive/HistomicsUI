const path = require('path');

const webpack = require('webpack');

const CopyWebpackPlugin = require('copy-webpack-plugin');
const {VueLoaderPlugin} = require('vue-loader');

module.exports = function (config) {
    config.plugins.push(
        new CopyWebpackPlugin([{
            from: path.join(path.resolve(__dirname), 'static'),
            to: config.output.path,
            toType: 'dir'
        }, {
            from: require.resolve('plotly.js/dist/plotly.min.js'),
            to: path.join(config.output.path, 'extra', 'plotly.js'),
            toType: 'file'
        }, {
            from: require.resolve('sinon/pkg/sinon.js'),
            to: path.join(config.output.path, 'extra', 'sinon.js')
        }])
    );
    config.plugins.push(
        new webpack.DefinePlugin({
            BUILD_TIMESTAMP: Date.now()
        })
    );
    config.module.rules.push({
        resource: {
            test: /\.vue$/
        },
        use: [
            require.resolve('vue-loader')
        ]
    });
    config.resolve = {
        alias: {
            vue: process.env.NODE_ENV === 'production' ? 'vue/dist/vue.min.js' : 'vue/dist/vue.js'
        }
    };
    config.plugins.push(new VueLoaderPlugin());
    return config;
};
