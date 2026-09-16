export default function Loader({ text = 'Yuklanmoqda...' }) {
  return (
    <div className="loader">
      <div className="loader__spinner" />
      <p>{text}</p>
    </div>
  );
}
