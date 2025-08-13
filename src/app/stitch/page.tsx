import ImageStitcher from "@/components/ImageStitcher";

export const metadata = {
  title: "拼接长图 | Image Stitcher",
};

export default function StitchPage() {
  return (
    <div className="p-6 sm:p-10">
      <h1 className="text-2xl font-bold mb-4">拼接长图</h1>
      <p className="text-gray-600 mb-6">
        选择多张图片，设置方向、对齐、间距与背景色，一键生成长图并下载。
      </p>
      <ImageStitcher />
    </div>
  );
}

