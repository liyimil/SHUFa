import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  description: "了解书法学习 App 的拍摄、对比、结构提示和再次练习能力。",
  robots: { follow: true, index: false },
  title: "书法学习 App · 内测准备中",
};

export default function AppGuidePage() {
  return (
    <main className="result-shell app-guide-shell">
      <p className="eyebrow">从可靠查字到反复临写</p>
      <h1 className="app-guide-title">网页帮你查，App 陪你练</h1>
      <p className="lead">
        两端使用同一套经过来源与版权审核的范字。公开网页无需登录即可查字；移动
        App 负责需要相机、私有作品和练习记录的完整学习过程。
      </p>

      <div className="product-role-grid">
        <section aria-labelledby="web-role-title" className="product-role-card">
          <p className="app-status available">网页 · 现在可用</p>
          <h2 id="web-role-title">查一个字，核对名家出处</h2>
          <ul>
            <li>按书家、碑帖和书体筛选同字范字</li>
            <li>查看版本、来源、许可和原帖位置</li>
            <li>打开由练习者主动创建的分享结果</li>
          </ul>
        </section>

        <section
          aria-labelledby="mobile-role-title"
          className="product-role-card"
        >
          <p className="app-status">App · 内测准备中</p>
          <h2 id="mobile-role-title">拍下临写，完成一次练习闭环</h2>
          <ol>
            <li>拍摄并精确框选一个毛笔字</li>
            <li>确认文字，选择来源可靠的名家范字</li>
            <li>并排或叠加对比，查看可解释的结构提示</li>
            <li>再次练习，保存历史、收藏和主动分享</li>
          </ol>
        </section>
      </div>

      <section
        aria-labelledby="availability-title"
        className="availability-note"
      >
        <h2 id="availability-title">为什么暂时没有下载按钮？</h2>
        <p>
          Android/iOS
          真机、隐私合规和内测渠道尚未完成验收。只有真实可安装渠道准备好后，这里才会提供正式入口，不会使用无效商店链接或把开发构建标成已发布产品。
        </p>
      </section>

      <Link className="back-link" href="/">
        先在网页查一个字
      </Link>
    </main>
  );
}
