const PageTemplate = ({ title, description }) => {
  return (
    <section style={sectionStyle}>
      <div style={cardStyle}>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
};

const sectionStyle = {
  minHeight: "90vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: "20px",
  background: "linear-gradient(135deg, #e0e0e0, #ffffff)",
  animation: "fadeIn 1s",
};

const cardStyle = {
  background: "rgba(255, 255, 255, 0.9)",
  padding: "40px",
  borderRadius: "20px",
  boxShadow: "0 20px 40px rgba(0,0,0,0.15)",
  textAlign: "center",
  maxWidth: "600px",
  transition: "0.3s",
};

export default PageTemplate;
