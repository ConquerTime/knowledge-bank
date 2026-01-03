# Nextjs tutorial

## 1. 安装

模板指令
```
```

## 2. 样式

全局tailwindcss

基于module.css文件的scoped css

clsx的类名选择器

## 3. 优化图片与字体

使用next封装的next/font和next/image优化网页的CLS（cumulative layout shift），避免因为字体和图片的加载导致页面布局的变化，已经其他性能

### 字体优化

从next/font/google中引用字体并创建实例

```ts
import { Inter } from 'next/font/google';
 
export const inter = Inter({ subsets: ['latin'] });
```

### 图片优化

目的：

- Ensure your image is responsive on different screen sizes.
- Specify image sizes for different devices.
- Prevent layout shift as the images load.
- Lazy load images that are outside the user's viewport.



> - [Image Optimization Docs](https://nextjs.org/docs/app/building-your-application/optimizing/images)
> - [Font Optimization Docs](https://nextjs.org/docs/app/building-your-application/optimizing/fonts)
> - [Improving Web Performance with Images (MDN)](https://developer.mozilla.org/en-US/docs/Learn/Performance/Multimedia)
> - [Web Fonts (MDN)](https://developer.mozilla.org/en-US/docs/Learn/CSS/Styling_text/Web_fonts)
> - [How Core Web Vitals Affect SEO](https://vercel.com/blog/how-core-web-vitals-affect-seo)
> - [How Google handles JavaScript throughout the indexing process](https://vercel.com/blog/how-google-handles-javascript-throughout-the-indexing-process)

## 4.文件路由系统——page和layout

## 5.页面间路由 Link

next会自动拆分代码块，当Link组件出现在浏览器视图中时，Next会自动在后台预获取被link的路由页面的代码（具体咋prefetch的？），这样用户点击link时，
