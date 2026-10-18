'use client';
export default function ErrorPage({reset}: {reset:()=>void}) {
  return <main className="fatal-error"><h1>Не получилось открыть spot</h1><p>Попробуйте загрузить приложение ещё раз.</p><button onClick={reset}>Повторить</button></main>;
}
