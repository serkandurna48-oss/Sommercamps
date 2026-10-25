import { startSchritte } from '../../(marketing)/preise/pakete'

export default function StartSteps() {
  return (
    <section className="light" id="start" aria-labelledby="start-heading">
      <div className="wrap sec">
        <div className="sec-head wide">
          <h2 className="d2" id="start-heading">So starten Sie</h2>
        </div>
        <ol className="start-steps" role="list">
          {startSchritte.map((schritt, index) => (
            <li className="price-card" key={schritt.titel}>
              <span className="label on-light" aria-hidden="true">{index + 1}</span>
              <h3 className="d3">{schritt.titel}</h3>
              <p>{schritt.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
