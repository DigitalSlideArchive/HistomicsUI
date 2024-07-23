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
            // the minified version fails in our test environment because
            // plotly.min.js uses some modern javascript (plotly.js doesn't)
            from: require.resolve(process.env.TOX_ENV_NAME ? 'plotly.js/dist/plotly.js' : 'plotly.js/dist/plotly.min.js'),
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
