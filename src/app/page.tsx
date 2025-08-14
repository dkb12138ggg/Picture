import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-50 dark:from-black dark:via-black dark:to-zinc-900 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-gradient-to-br from-indigo-500 to-violet-600" />
          <span className="font-semibold tracking-tight">Image Stitcher</span>
        </div>
        <nav className="hidden sm:flex items-center gap-6 text-sm text-slate-600 dark:text-slate-400">
          <a
            href="#features"
            className="hover:text-slate-900 dark:hover:text-white"
          >
            功能
          </a>
          <Link
            href="/stitch"
            className="hover:text-slate-900 dark:hover:text-white"
          >
            开始使用
          </Link>
          <a
            href="https://github.com/"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-900 dark:hover:text-white"
          >
            GitHub
          </a>
        </nav>
      </header>

      {/* Hero */}
      <main className="relative overflow-hidden">
        {/* Decorations */}
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="absolute top-32 -right-12 h-48 w-48 rounded-full bg-violet-500/20 blur-3xl" />
        </div>

        <section className="max-w-6xl mx-auto px-6 pt-10 pb-14 sm:pt-16 sm:pb-20">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300 px-3 py-1 text-xs font-medium">
              <span className="inline-block size-2 rounded-full bg-indigo-500" />
              专注于“长图拼接”的轻量工具
            </p>
            <h1 className="mt-5 text-4xl sm:text-5xl font-bold tracking-tight">
              一键拼接长图，快而好看
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-400">
              拖拽排序、尺寸对齐、水印、边框圆角、导出格式与质量可调；支持 Web
              Worker 加速与实时进度/取消。
            </p>
            <div className="mt-8 flex items-center gap-4">
              <Link
                href="/stitch"
                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white h-11 px-6 shadow-sm"
              >
                立即开始
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300/80 dark:border-slate-700 h-11 px-6 text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5"
              >
                了解功能
              </a>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="max-w-6xl mx-auto px-6 pb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[
              { t: "拖拽排序", d: "直接拖动图片改变顺序，所见即所得" },
              { t: "尺寸对齐", d: "按宽/高统一，支持最大导出尺寸" },
              { t: "水印", d: "文本/图片水印，透明度、旋转、平铺与位置" },
              { t: "样式", d: "间隔线、外边距、圆角与边框颜色" },
              { t: "Worker 加速", d: "高分辨率图片处理更顺滑，支持取消与进度" },
              { t: "导出", d: "PNG/JPEG/WebP，质量可调" },
            ].map((f) => (
              <div
                key={f.t}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-white/5 p-5 backdrop-blur-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex size-7 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300">
                    ★
                  </span>
                  <h3 className="font-semibold">{f.t}</h3>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                  {f.d}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA bottom */}
        <section className="max-w-6xl mx-auto px-6 pb-24">
          <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-gradient-to-br from-indigo-600 to-violet-600 p-6 sm:p-8 text-white flex items-center justify-between flex-col sm:flex-row gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold">
                准备好开始了吗？
              </h2>
              <p className="text-white/80 text-sm mt-1">
                无需安装，浏览器直接体验。
              </p>
            </div>
            <Link
              href="/stitch"
              className="inline-flex items-center justify-center rounded-lg bg-white text-indigo-700 hover:bg-white/90 h-11 px-6 font-medium"
            >
              去拼接长图
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200/80 dark:border-slate-800 py-8">
        <div className="max-w-6xl mx-auto px-6 text-sm text-slate-600 dark:text-slate-400 flex items-center justify-between">
          <p>© {new Date().getFullYear()} Image Stitcher</p>
          <div className="flex items-center gap-4">
            <a
              href="#features"
              className="hover:text-slate-900 dark:hover:text-white"
            >
              功能
            </a>
            <Link
              href="/stitch"
              className="hover:text-slate-900 dark:hover:text-white"
            >
              开始使用
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
