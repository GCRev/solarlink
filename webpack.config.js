const path = require('path')
const webpack = require('webpack')

module.exports = {
  mode: 'development',
  plugins: [
    new webpack.ProvidePlugin({
      "React": "react"
    })
    // new webpack.ProgressPlugin()
  ],

  output: {
    path: path.resolve(__dirname, 'public')
  },

  module: {
    rules: [ {
      test: /\.(js|jsx)$/,
      include: [ path.resolve(__dirname, 'src') ],
      loader: 'babel-loader'
    }, {
      test: /.css$/,

      use: [ {
        loader: "style-loader"
      }, {
        loader: "css-loader",
        options: {
          sourceMap: true
        }
      } ]
    }, {
      test: /\.(vert|frag)$/i,
      type: 'asset/source'
    } ]
  },
  devtool: 'source-map',
  devServer: {
    open: false,
    host: 'localhost',
    contentBase: './public',
    writeToDisk: true
  }
}
