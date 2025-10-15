const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: './src',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|svg|jpg|jpeg|gif)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[hash][ext][query]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './src/index.html',
      favicon: './src/assets/favicon.png',
      publicPath: './',
    }),
    new CopyPlugin({
      patterns: [
        { from: 'public/manifest.json', to: 'manifest.json' },
        { from: 'public/service-worker.js', to: 'service-worker.js' },
        { from: 'public/icon-192.png', to: 'icon-192.png' },
        { from: 'public/icon-512.png', to: 'icon-512.png' },
      ],
    }),
  ],
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
    publicPath: '/',
    hashFunction: 'sha256',
  },
  devServer: {
    port: 8081,
  },
};
```

---

## 🎨 **STEP 7: Create the App Icons**

You need 2 icon files. Here's the easiest way:

### **Option 1: Download from Online Tool** ⭐ **EASIEST**

1. Go to: https://icon.kitchen/
2. Click "Upload Image"
3. Upload your PowerHouze logo
4. Click "Download"
5. Unzip the downloaded file
6. Find these files and rename them:
   - `android-chrome-192x192.png` → rename to `icon-192.png`
   - `android-chrome-512x512.png` → rename to `icon-512.png`
7. Put BOTH files in your `public/` folder

### **Option 2: Use Placeholder (For Testing)**

If you just want to test quickly, download these solid blue squares with clock emoji:

**Create 2 blue squares in any image editor:**
- 192x192 pixels - solid blue (#2563eb) - add ⏰ emoji
- 512x512 pixels - solid blue (#2563eb) - add ⏰ emoji
- Save as `icon-192.png` and `icon-512.png`
- Put in `public/` folder

---

## ⚙️ **STEP 8: Install Required Package**

Open your terminal/command prompt in your project folder and run:
```
npm install --save-dev copy-webpack-plugin
```

---

## 🏗️ **STEP 9: Build & Test**
```
npm run build
```

Then upload your `dist/` folder to your server like you normally do!

---

## ✅ **Final Checklist:**

Your project folder should now look like this:
```
employee-time-clock/
├── public/
│   ├── manifest.json          ✅ (NEW)
│   ├── service-worker.js      ✅ (NEW)
│   ├── icon-192.png           ✅ (NEW)
│   └── icon-512.png           ✅ (NEW)
├── src/
│   ├── components/
│   │   ├── PWAInstaller.tsx   ✅ (NEW)
│   │   └── ... (other components)
│   ├── App.tsx                ✅ (UPDATED)
│   └── index.html             ✅ (UPDATED)
├── webpack.config.js          ✅ (UPDATED)
└── package.json
