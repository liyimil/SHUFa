import Link from "next/link";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">名家书法单字库</p>
        <h1>写下一个字，看看历代名家如何落笔</h1>
        <p className="lead">
          输入一个汉字，查看经过审核且来源可追溯的名家范字。没有可靠资料时，我们会如实告诉你。
        </p>
        <form action="/search" className="search-form" method="get">
          <label htmlFor="character-query">想查哪个字？</label>
          <div className="search-row">
            <input
              autoComplete="off"
              autoFocus
              id="character-query"
              inputMode="text"
              maxLength={2}
              name="q"
              placeholder="永"
              required
            />
            <button type="submit">查看名家写法</button>
          </div>
        </form>
        <aside aria-labelledby="app-invite-title" className="app-invite">
          <div>
            <p className="app-status">App 内测准备中</p>
            <h2 id="app-invite-title">查完这个字，还可以拍下你的临写继续练</h2>
            <p>
              当前网页专注可靠查字；App
              将承接拍摄、范字对比、结构提示、再次练习和历史记录。
            </p>
          </div>
          <Link className="secondary-link" href="/app">
            了解 App 练习能力
          </Link>
        </aside>
      </section>
    </main>
  );
}
