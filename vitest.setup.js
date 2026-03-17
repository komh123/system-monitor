import '@testing-library/jest-dom';

// Mock scrollIntoView and scrollTo (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn();
window.scrollTo = vi.fn();
