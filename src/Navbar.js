import React, { useState } from 'react';
import './Navbar.css';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const toggleMenu = () => setIsOpen(!isOpen);

  return (
    <nav className="navbar">
      <div className="logo">MyService</div>
      <div className={`nav-links ${isOpen ? 'open' : ''}`}>
        <a href="#home">Home</a>
        <a href="#services">Services</a>
        <a href="#problems">Problems</a>
        <a href="#features">Features</a>
        <a href="#reviews">Reviews</a>
        <a href="#contact">Contact</a>
      </div>
      <div className="hamburger" onClick={toggleMenu}>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </nav>
  );
};

export default Navbar;
