"""Domain-specific EN<->VI terminology glossaries for selection translation.

Each entry is `(english_term, vietnamese_term)` — a single bidirectional pair
used regardless of translation direction (see `translation_service._mask_terms`,
which picks the source/target side based on the active direction). Terms are
curated for entries whose generic NMT output tends to drift from the
Vietnamese wording actually used in that field's academic literature; common
loanwords already left untranslated in practice (e.g. "transformer", "epoch",
"embedding") are deliberately omitted rather than forced into an awkward
translation.

This is a v1 starter set, not an exhaustive terminology database — intended
to be extended over time as gaps are found in real use.
"""

from __future__ import annotations


GLOSSARY_CS_AI: list[tuple[str, str]] = [
    ("neural network", "mạng nơ-ron"),
    ("convolutional neural network", "mạng nơ-ron tích chập"),
    ("recurrent neural network", "mạng nơ-ron hồi quy"),
    ("deep learning", "học sâu"),
    ("machine learning", "học máy"),
    ("supervised learning", "học có giám sát"),
    ("unsupervised learning", "học không giám sát"),
    ("reinforcement learning", "học tăng cường"),
    ("gradient descent", "hạ gradient"),
    ("backpropagation", "lan truyền ngược"),
    ("overfitting", "quá khớp"),
    ("underfitting", "dưới khớp"),
    ("loss function", "hàm mất mát"),
    ("activation function", "hàm kích hoạt"),
    ("attention mechanism", "cơ chế chú ý"),
    ("training set", "tập huấn luyện"),
    ("training data", "dữ liệu huấn luyện"),
    ("test set", "tập kiểm tra"),
    ("validation set", "tập xác thực"),
    ("hyperparameter", "siêu tham số"),
    ("learning rate", "tốc độ học"),
    ("batch size", "kích thước lô"),
    ("feature extraction", "trích xuất đặc trưng"),
    ("dimensionality reduction", "giảm chiều dữ liệu"),
    ("decision tree", "cây quyết định"),
    ("random forest", "rừng ngẫu nhiên"),
    ("support vector machine", "máy vector hỗ trợ"),
    ("natural language processing", "xử lý ngôn ngữ tự nhiên"),
    ("computer vision", "thị giác máy tính"),
    ("data augmentation", "tăng cường dữ liệu"),
    ("regularization", "chính quy hóa"),
    ("time complexity", "độ phức tạp thời gian"),
    ("distributed system", "hệ thống phân tán"),
    ("object-oriented programming", "lập trình hướng đối tượng"),
    ("source code", "mã nguồn"),
    ("compiler", "trình biên dịch"),
    ("operating system", "hệ điều hành"),
]

GLOSSARY_STEM: list[tuple[str, str]] = [
    ("differential equation", "phương trình vi phân"),
    ("integral", "tích phân"),
    ("derivative", "đạo hàm"),
    ("matrix", "ma trận"),
    ("eigenvalue", "giá trị riêng"),
    ("eigenvector", "vector riêng"),
    ("vector space", "không gian vector"),
    ("probability distribution", "phân bố xác suất"),
    ("standard deviation", "độ lệch chuẩn"),
    ("variance", "phương sai"),
    ("linear regression", "hồi quy tuyến tính"),
    ("convergence", "sự hội tụ"),
    ("theorem", "định lý"),
    ("hypothesis", "giả thuyết"),
    ("quantum mechanics", "cơ học lượng tử"),
    ("electromagnetic field", "trường điện từ"),
    ("kinetic energy", "động năng"),
    ("potential energy", "thế năng"),
    ("angular momentum", "mô-men động lượng"),
    ("wave function", "hàm sóng"),
    ("thermodynamics", "nhiệt động lực học"),
    ("velocity", "vận tốc"),
    ("acceleration", "gia tốc"),
    ("frequency", "tần số"),
    ("wavelength", "bước sóng"),
    ("refractive index", "chiết suất"),
    ("chemical bond", "liên kết hóa học"),
    ("molecular structure", "cấu trúc phân tử"),
    ("catalyst", "chất xúc tác"),
    ("chemical equilibrium", "cân bằng hóa học"),
    ("covalent bond", "liên kết cộng hóa trị"),
    ("ionic bond", "liên kết ion"),
    ("oxidation", "sự oxy hóa"),
    ("reduction reaction", "phản ứng khử"),
    ("molar mass", "khối lượng mol"),
    ("concentration", "nồng độ"),
]

GLOSSARY_ECON_SOCIAL: list[tuple[str, str]] = [
    ("gross domestic product", "tổng sản phẩm quốc nội"),
    ("inflation rate", "tỷ lệ lạm phát"),
    ("supply and demand", "cung và cầu"),
    ("monetary policy", "chính sách tiền tệ"),
    ("fiscal policy", "chính sách tài khóa"),
    ("interest rate", "lãi suất"),
    ("exchange rate", "tỷ giá hối đoái"),
    ("economic growth", "tăng trưởng kinh tế"),
    ("unemployment rate", "tỷ lệ thất nghiệp"),
    ("market equilibrium", "cân bằng thị trường"),
    ("opportunity cost", "chi phí cơ hội"),
    ("marginal utility", "lợi ích cận biên"),
    ("income inequality", "bất bình đẳng thu nhập"),
    ("labor market", "thị trường lao động"),
    ("economic policy", "chính sách kinh tế"),
    ("public policy", "chính sách công"),
    ("social welfare", "phúc lợi xã hội"),
    ("socioeconomic status", "tình trạng kinh tế - xã hội"),
    ("sample size", "cỡ mẫu"),
    ("survey methodology", "phương pháp khảo sát"),
    ("qualitative research", "nghiên cứu định tính"),
    ("quantitative research", "nghiên cứu định lượng"),
    ("correlation coefficient", "hệ số tương quan"),
    ("statistical significance", "ý nghĩa thống kê"),
    ("regression analysis", "phân tích hồi quy"),
    ("case study", "nghiên cứu điển hình"),
    ("stakeholder", "bên liên quan"),
    ("governance", "quản trị"),
    ("sustainable development", "phát triển bền vững"),
    ("human capital", "vốn nhân lực"),
]

# Keys are the wire-format `domain` value sent by the frontend
# (TranslationDomain in frontend/src/services/api.ts) and stored per-entry
# in TranslateRequest.domain — keep both in sync when adding a domain.
DOMAINS: dict[str, list[tuple[str, str]]] = {
    "cs_ai": GLOSSARY_CS_AI,
    "stem": GLOSSARY_STEM,
    "econ_social": GLOSSARY_ECON_SOCIAL,
}

DOMAIN_LABELS: dict[str, str] = {
    "cs_ai": "Khoa học máy tính / AI-ML",
    "stem": "Toán - Lý - Hóa",
    "econ_social": "Kinh tế / Khoa học xã hội",
}
