import os
import sys

from PyQt6.QtCore import QPointF, QPropertyAnimation, QSize, QTimer, Qt
from PyQt6.QtGui import QColor, QFont, QIcon, QImage, QLinearGradient, QPainter, QPainterPath, QPixmap
from PyQt6.QtWidgets import (
    QApplication,
    QCheckBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QMainWindow,
    QProgressBar,
    QPushButton,
    QSizePolicy,
    QStackedLayout,
    QStackedWidget,
    QToolButton,
    QVBoxLayout,
    QWidget,
)

try:
    import qtawesome as qta
except ImportError:
    qta = None

try:
    import cv2
except ImportError:
    cv2 = None


APP_DIR = os.path.dirname(os.path.abspath(__file__))
BLUE = "#1298ff"
TEXT = "#f8fafc"
MUTED = "#b8c0cf"
PANEL = "#061225"
CARD = "rgba(16, 29, 48, 0.82)"
BORDER = "rgba(148, 163, 184, 0.28)"


def configure_qtawesome():
    if qta is None or os.name != "nt":
        return

    fonts_dir = os.path.join(os.path.dirname(os.path.abspath(qta.__file__)), "fonts")
    if not os.path.isdir(fonts_dir) or not hasattr(qta, "_BUNDLED_FONTS"):
        return

    # On some Windows setups QtAwesome cannot write to the user fonts folder.
    # Supplying the bundled fonts directory lets Qt load them from site-packages.
    qta._BUNDLED_FONTS = tuple(
        font if len(font) >= 4 else (*font, fonts_dir)
        for font in qta._BUNDLED_FONTS
    )


configure_qtawesome()


def asset_path(name):
    return os.path.join(APP_DIR, name)


def add_shadow_like_style(widget, background=CARD):
    widget.setStyleSheet(
        f"""
        QFrame#{widget.objectName()} {{
            background: {background};
            border: 1px solid {BORDER};
            border-radius: 18px;
        }}
        """
    )


def make_label(text, size=14, color=TEXT, weight=400, align=None):
    label = QLabel(text)
    label.setStyleSheet(f"color: {color}; font-size: {size}px; font-weight: {weight};")
    label.setWordWrap(True)
    if align is not None:
        label.setAlignment(align)
    return label


def make_button(text, primary=True):
    button = QPushButton(text)
    button.setCursor(Qt.CursorShape.PointingHandCursor)
    if primary:
        button.setStyleSheet(
            """
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #2687ff, stop:1 #0f5fe5);
                color: #ffffff;
                border: none;
                border-radius: 8px;
                padding: 14px 18px;
                font-size: 15px;
                font-weight: 700;
            }
            QPushButton:hover { background: #277dff; }
            QPushButton:pressed { background: #1657d8; }
            """
        )
    else:
        button.setStyleSheet(
            """
            QPushButton {
                background: rgba(20, 34, 52, 0.86);
                color: #f8fafc;
                border: 1px solid rgba(148, 163, 184, 0.30);
                border-radius: 8px;
                padding: 13px 18px;
                font-size: 15px;
                font-weight: 700;
            }
            QPushButton:hover { border-color: rgba(18, 152, 255, 0.70); }
            QPushButton:pressed { background: rgba(15, 27, 43, 0.95); }
            """
        )
    return button


def fontawesome_icon(name, color="#9aa7bb"):
    if qta is None:
        return None
    try:
        return qta.icon(name, color=color)
    except Exception:
        return None


class IconLineEdit(QFrame):
    def __init__(self, placeholder, icon_name, fallback_icon, password=False, height=48):
        super().__init__()
        self.setObjectName("iconInput")
        self.setMinimumHeight(height)
        self.setMaximumHeight(height)
        self.setStyleSheet(
            """
            QFrame#iconInput {
                background: rgba(8, 18, 31, 0.82);
                border: 1px solid rgba(148, 163, 184, 0.22);
                border-radius: 7px;
            }
            """
        )

        layout = QHBoxLayout(self)
        layout.setContentsMargins(14, 0, 12, 0)
        layout.setSpacing(12)

        leading = QLabel()
        leading.setFixedSize(20, 20)
        leading.setAlignment(Qt.AlignmentFlag.AlignCenter)
        icon = fontawesome_icon(icon_name)
        if icon is not None:
            leading.setPixmap(icon.pixmap(18, 18))
        else:
            leading.setText(fallback_icon)
            leading.setStyleSheet("color: #9aa7bb; font-size: 13px; font-weight: 700;")
        layout.addWidget(leading)

        self.field = QLineEdit()
        self.field.setPlaceholderText(placeholder)
        self.field.setFrame(False)
        if password:
            self.field.setEchoMode(QLineEdit.EchoMode.Password)
        self.field.setStyleSheet(
            """
            QLineEdit {
                background: transparent;
                border: none;
                color: #f8fafc;
                font-size: 14px;
                padding: 0;
            }
            QLineEdit::placeholder { color: #8d99aa; }
            """
        )
        layout.addWidget(self.field, stretch=1)

        if password:
            reveal = QToolButton()
            reveal.setCheckable(True)
            reveal.setCursor(Qt.CursorShape.PointingHandCursor)
            reveal.setFixedSize(24, 24)
            eye_icon = fontawesome_icon("fa5s.eye", "#8f9bad")
            if eye_icon is not None:
                reveal.setIcon(eye_icon)
            else:
                reveal.setText("show")
            reveal.setStyleSheet(
                """
                QToolButton {
                    background: transparent;
                    color: #8f9bad;
                    border: none;
                    font-size: 9px;
                }
                QToolButton:hover { color: #d7deea; }
                """
            )
            reveal.toggled.connect(self.toggle_password)
            reveal.toggled.connect(lambda visible, button=reveal: self.update_reveal_icon(button, visible))
            layout.addWidget(reveal)

    def toggle_password(self, visible):
        self.field.setEchoMode(QLineEdit.EchoMode.Normal if visible else QLineEdit.EchoMode.Password)

    def update_reveal_icon(self, button, visible):
        icon_name = "fa5s.eye-slash" if visible else "fa5s.eye"
        icon = fontawesome_icon(icon_name, "#8f9bad")
        if icon is not None:
            button.setIcon(icon)
        else:
            button.setText("hide" if visible else "show")


def make_input(placeholder, password=False, icon_name="", fallback_icon="", height=48):
    if icon_name:
        return IconLineEdit(placeholder, icon_name, fallback_icon, password, height)

    field = QLineEdit()
    field.setPlaceholderText(placeholder)
    field.setMinimumHeight(height)
    field.setMaximumHeight(height)
    if password:
        field.setEchoMode(QLineEdit.EchoMode.Password)
    field.setStyleSheet(
        """
        QLineEdit {
            background: rgba(8, 18, 31, 0.82);
            border: 1px solid rgba(148, 163, 184, 0.22);
            border-radius: 7px;
            color: #f8fafc;
            padding: 0 16px;
            font-size: 14px;
        }
        QLineEdit:focus { border-color: rgba(18, 152, 255, 0.80); }
        QLineEdit::placeholder { color: #8d99aa; }
        """
    )
    return field


class TitleBar(QFrame):
    def __init__(self, window):
        super().__init__()
        self.window = window
        self.drag_start = None
        self.setObjectName("titleBar")
        self.setFixedHeight(56)
        self.setStyleSheet(
            """
            QFrame#titleBar {
                background: rgba(2, 8, 16, 0.96);
                border-top-left-radius: 10px;
                border-top-right-radius: 10px;
                border-bottom: 1px solid rgba(148, 163, 184, 0.10);
            }
            """
        )

        layout = QHBoxLayout(self)
        layout.setContentsMargins(20, 0, 16, 0)
        layout.setSpacing(10)

        logo = QLabel()
        logo.setFixedSize(34, 28)
        pixmap = QPixmap(asset_path("cloud-os-logo.png"))
        if not pixmap.isNull():
            logo.setPixmap(
                pixmap.scaled(
                    logo.size(),
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
            )
        layout.addWidget(logo)

        title = make_label("Cloud OS", 15, "#ffffff", 500)
        layout.addWidget(title)
        layout.addStretch()

        for label, handler in (
            ("−", self.window.showMinimized),
            ("□", self.toggle_maximized),
            ("×", self.window.close),
        ):
            btn = QPushButton(label)
            btn.setFixedSize(42, 34)
            btn.setCursor(Qt.CursorShape.PointingHandCursor)
            btn.clicked.connect(handler)
            btn.setStyleSheet(
                """
                QPushButton {
                    background: transparent;
                    color: #ffffff;
                    border: none;
                    border-radius: 6px;
                    font-size: 20px;
                    font-weight: 300;
                }
                QPushButton:hover { background: rgba(255, 255, 255, 0.10); }
                """
            )
            layout.addWidget(btn)

    def toggle_maximized(self):
        if self.window.isMaximized():
            self.window.showNormal()
        else:
            self.window.showMaximized()

    def mousePressEvent(self, event):
        if event.button() == Qt.MouseButton.LeftButton:
            self.drag_start = event.globalPosition().toPoint() - self.window.frameGeometry().topLeft()
            event.accept()

    def mouseMoveEvent(self, event):
        if self.drag_start and event.buttons() & Qt.MouseButton.LeftButton:
            if self.window.isMaximized():
                self.window.showNormal()
            self.window.move(event.globalPosition().toPoint() - self.drag_start)
            event.accept()

    def mouseReleaseEvent(self, event):
        self.drag_start = None
        event.accept()


class CloudGraphic(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumSize(250, 230)
        self.setMaximumHeight(260)

    def paintEvent(self, event):
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        rect = self.rect()
        cx = rect.width() / 2
        top = rect.height() * 0.18

        glow = QLinearGradient(0, top, 0, rect.height())
        glow.setColorAt(0, QColor(33, 184, 255, 90))
        glow.setColorAt(1, QColor(15, 82, 222, 8))
        painter.setBrush(glow)
        painter.setPen(Qt.PenStyle.NoPen)
        painter.drawEllipse(int(cx - 62), int(top + 8), 124, 74)

        cloud = QPainterPath()
        cloud.addEllipse(QPointF(cx - 42, top + 56), 34, 34)
        cloud.addEllipse(QPointF(cx, top + 42), 52, 52)
        cloud.addEllipse(QPointF(cx + 42, top + 62), 36, 36)
        cloud.addRoundedRect(int(cx - 82), int(top + 58), 164, 58, 28, 28)
        cloud_gradient = QLinearGradient(0, int(top + 25), 0, int(top + 120))
        cloud_gradient.setColorAt(0, QColor("#4bd8ff"))
        cloud_gradient.setColorAt(1, QColor("#0b5ae6"))
        painter.fillPath(cloud, cloud_gradient)

        inner = QPainterPath()
        inner.addEllipse(QPointF(cx - 35, top + 80), 31, 27)
        inner.addEllipse(QPointF(cx + 2, top + 72), 39, 35)
        inner.addRoundedRect(int(cx - 65), int(top + 82), 116, 38, 20, 20)
        inner_gradient = QLinearGradient(0, int(top + 60), 0, int(top + 122))
        inner_gradient.setColorAt(0, QColor("#eefaff"))
        inner_gradient.setColorAt(1, QColor("#6bcaff"))
        painter.fillPath(inner, inner_gradient)

        beam = QLinearGradient(0, int(top + 120), 0, int(top + 184))
        beam.setColorAt(0, QColor(21, 172, 255, 210))
        beam.setColorAt(1, QColor(21, 172, 255, 0))
        painter.setBrush(beam)
        painter.drawRoundedRect(int(cx - 5), int(top + 116), 10, 72, 5, 5)

        base_gradient = QLinearGradient(0, int(top + 160), 0, int(top + 220))
        base_gradient.setColorAt(0, QColor("#1cbcff"))
        base_gradient.setColorAt(1, QColor("#0a44be"))
        painter.setBrush(base_gradient)
        painter.setPen(QColor(34, 170, 255, 150))
        painter.drawRoundedRect(int(cx - 52), int(top + 170), 104, 34, 7, 7)
        painter.setBrush(QColor("#0b1430"))
        painter.drawRoundedRect(int(cx - 74), int(top + 190), 148, 26, 8, 8)

        painter.setPen(QColor(18, 152, 255, 120))
        for offset in (-94, -58, 58, 94):
            x = int(cx + offset)
            painter.drawLine(x, int(top + 196), x, int(top + 142))
            painter.drawRoundedRect(x - 19, int(top + 130), 38, 38, 8, 8)


class BrandPanel(QFrame):
    def __init__(self, compact=False, support_footer=False, parent=None):
        super().__init__(parent)
        self.setObjectName("brandPanel")
        self.setMinimumWidth(330 if compact else 360)
        self.setStyleSheet(
            """
            QFrame#brandPanel {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #061a33, stop:0.55 #031023, stop:1 #020813);
                border-right: 1px solid rgba(148, 163, 184, 0.10);
            }
            """
        )

        layout = QVBoxLayout(self)
        layout.setContentsMargins(38, 62, 38, 30)
        layout.setSpacing(18)

        logo = QLabel()
        logo.setAlignment(Qt.AlignmentFlag.AlignCenter)
        logo.setFixedHeight(118)
        pixmap = QPixmap(asset_path("cloud-os-logo.png"))
        if not pixmap.isNull():
            logo.setPixmap(
                pixmap.scaled(
                    210,
                    118,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
            )
        layout.addWidget(logo)

        name = QLabel('Cloud <span style="color:#1298ff;">OS</span>')
        name.setTextFormat(Qt.TextFormat.RichText)
        name.setAlignment(Qt.AlignmentFlag.AlignCenter)
        name.setStyleSheet("color: #ffffff; font-size: 36px; font-weight: 800;")
        layout.addWidget(name)

        tagline = make_label(
            "Cloud-powered workspace for\nfiles, apps, messages, calls,\nand more.",
            17,
            "#c5ccda",
            400,
            Qt.AlignmentFlag.AlignCenter,
        )
        tagline.setStyleSheet("color: #c5ccda; font-size: 17px; line-height: 1.35;")
        layout.addWidget(tagline)

        layout.addSpacing(24)
        graphic = CloudGraphic()
        layout.addWidget(graphic, stretch=1)
        layout.addStretch()

        footer_text = "?  Need help? <span style='color:#1298ff;'>Contact Support</span>"
        if not support_footer:
            footer_text = "(c) 2026 Cloud OS. All rights reserved."
        footer = QLabel(footer_text)
        footer.setTextFormat(Qt.TextFormat.RichText)
        footer.setStyleSheet("color: #9aa4b5; font-size: 13px;")
        footer.setAlignment(Qt.AlignmentFlag.AlignLeft)
        layout.addWidget(footer)


class Divider(QWidget):
    def __init__(self, text="or"):
        super().__init__()
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)
        for i in range(2):
            line = QFrame()
            line.setFrameShape(QFrame.Shape.HLine)
            line.setStyleSheet("background: rgba(148, 163, 184, 0.16); max-height: 1px;")
            if i == 0:
                layout.addWidget(line)
                layout.addWidget(make_label(text, 14, "#aeb7c8", 400, Qt.AlignmentFlag.AlignCenter))
            else:
                layout.addWidget(line)


class AuthCard(QFrame):
    def __init__(self, mode, main_window):
        super().__init__()
        self.mode = mode
        self.main_window = main_window
        self.setObjectName(f"{mode}Card")
        add_shadow_like_style(self)
        self.setMaximumWidth(520 if mode == "signup" else 500)
        self.setMinimumWidth(420)
        self.build()

    def build(self):
        layout = QVBoxLayout(self)
        is_signup = self.mode == "signup"
        if is_signup:
            layout.setContentsMargins(30, 22, 30, 22)
        else:
            layout.setContentsMargins(34, 34, 34, 34)
        layout.setSpacing(8 if is_signup else 14)

        title = "Create Account" if is_signup else "Welcome Back"
        subtitle = "Join Cloud OS and get started" if is_signup else "Sign in to your Cloud OS account"
        layout.addWidget(make_label(title, 22 if is_signup else 23, TEXT, 800, Qt.AlignmentFlag.AlignCenter))
        layout.addWidget(make_label(subtitle, 13 if is_signup else 14, MUTED, 400, Qt.AlignmentFlag.AlignCenter))
        layout.addSpacing(6 if is_signup else 12)

        fields = []
        if is_signup:
            fields.extend(
                [
                    ("Full Name", "Enter your full name", False, "fa5s.user", "U"),
                    ("Email Address", "Enter your email", False, "fa5s.envelope", "@"),
                    ("Phone Number", "Enter your phone number", False, "fa5s.mobile-alt", "#"),
                    ("Password", "Create a password", True, "fa5s.lock", "*"),
                    ("Confirm Password", "Confirm your password", True, "fa5s.lock", "*"),
                ]
            )
        else:
            fields.extend(
                [
                    ("Email Address", "Enter your email", False, "fa5s.envelope", "@"),
                    ("Password", "Enter your password", True, "fa5s.lock", "*"),
                ]
            )

        self.inputs = []
        for label_text, placeholder, password, icon_name, fallback_icon in fields:
            layout.addWidget(make_label(label_text, 12 if is_signup else 13, "#ffffff", 600))
            field = make_input(
                placeholder,
                password,
                icon_name,
                fallback_icon,
                42 if is_signup else 48,
            )
            layout.addWidget(field)
            self.inputs.append(field.field if isinstance(field, IconLineEdit) else field)

        if is_signup:
            terms = QCheckBox("I accept the Terms and Conditions")
            terms.setCursor(Qt.CursorShape.PointingHandCursor)
            terms.setStyleSheet(
                """
                QCheckBox { color: #b8c0cf; font-size: 13px; spacing: 9px; }
                QCheckBox::indicator {
                    width: 17px;
                    height: 17px;
                    border: 1px solid rgba(148, 163, 184, 0.45);
                    border-radius: 3px;
                    background: rgba(8, 18, 31, 0.90);
                }
                QCheckBox::indicator:checked {
                    background: #1298ff;
                    border-color: #1298ff;
                }
                """
            )
            layout.addWidget(terms)
        else:
            forgot = QPushButton("Forgot Password?")
            forgot.setCursor(Qt.CursorShape.PointingHandCursor)
            forgot.setStyleSheet(
                """
                QPushButton {
                    background: transparent;
                    color: #1298ff;
                    border: none;
                    font-size: 13px;
                    padding: 0;
                }
                """
            )
            layout.addWidget(forgot, alignment=Qt.AlignmentFlag.AlignRight)

        submit = make_button("Sign Up" if is_signup else "Log In")
        submit.clicked.connect(self.main_window.show_os_selection)
        submit.setMinimumHeight(46 if is_signup else 52)
        submit.setMaximumHeight(46 if is_signup else 52)
        layout.addWidget(submit)
        divider = Divider()
        if is_signup:
            divider.setMaximumHeight(20)
        layout.addWidget(divider)

        google = make_button(("G  Sign up with Google" if is_signup else "G  Continue with Google"), primary=False)
        google.setMinimumHeight(44 if is_signup else 50)
        google.setMaximumHeight(44 if is_signup else 50)
        layout.addWidget(google)

        switch_text = (
            "Already have an account? <a href='login'>Log In</a>"
            if is_signup
            else "Don't have an account? <a href='signup'>Register</a>"
        )
        switch = QLabel(switch_text)
        switch.setTextFormat(Qt.TextFormat.RichText)
        switch.setOpenExternalLinks(False)
        switch.setAlignment(Qt.AlignmentFlag.AlignCenter)
        switch.setStyleSheet(
            """
            QLabel { color: #b8c0cf; font-size: 14px; }
            QLabel a { color: #1298ff; text-decoration: none; font-weight: 700; }
            """
        )
        switch.linkActivated.connect(
            lambda _link: self.main_window.show_login()
            if is_signup
            else self.main_window.show_register()
        )
        layout.addWidget(switch)


class AuthPage(QWidget):
    def __init__(self, mode, main_window):
        super().__init__()
        self.mode = mode
        self.main_window = main_window
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(BrandPanel(), stretch=5)

        right = QFrame()
        right.setObjectName("authRight")
        right.setStyleSheet(
            """
            QFrame#authRight {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #030a15, stop:1 #071426);
            }
            """
        )
        right_layout = QVBoxLayout(right)
        if mode == "signup":
            right_layout.setContentsMargins(34, 16, 34, 16)
        else:
            right_layout.setContentsMargins(34, 30, 34, 30)
        right_layout.addStretch()

        card = AuthCard(mode, main_window)
        right_layout.addWidget(card, alignment=Qt.AlignmentFlag.AlignCenter)

        right_layout.addStretch()
        layout.addWidget(right, stretch=7)


class LoginScreen(AuthPage):
    def __init__(self, main_window):
        super().__init__("login", main_window)


class RegisterScreen(AuthPage):
    def __init__(self, main_window):
        super().__init__("signup", main_window)


class OSCard(QFrame):
    def __init__(self, title, description, logo_name, primary, main_window):
        super().__init__()
        self.title = title
        self.main_window = main_window
        self.setObjectName(f"{title.replace(' ', '')}Card")
        add_shadow_like_style(self)
        self.setMinimumWidth(330)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(34, 34, 34, 34)
        layout.setSpacing(18)

        icon_box = QFrame()
        icon_box.setFixedSize(122, 122)
        icon_box.setStyleSheet(
            f"""
            QFrame {{
                background: {'rgba(12, 47, 90, 0.48)' if primary else 'rgba(255, 255, 255, 0.13)'};
                border: 1px solid {'rgba(18, 152, 255, 0.55)' if primary else 'rgba(255, 255, 255, 0.14)'};
                border-radius: 26px;
            }}
            """
        )
        icon_layout = QVBoxLayout(icon_box)
        icon_layout.setContentsMargins(18, 18, 18, 18)
        icon = QLabel()
        icon.setAlignment(Qt.AlignmentFlag.AlignCenter)
        pixmap = QPixmap(asset_path(logo_name))
        if not pixmap.isNull():
            icon.setPixmap(
                pixmap.scaled(
                    86,
                    86,
                    Qt.AspectRatioMode.KeepAspectRatio,
                    Qt.TransformationMode.SmoothTransformation,
                )
            )
        else:
            icon.setText("OS")
            icon.setStyleSheet("color: #ffffff; font-size: 28px; font-weight: 800;")
        icon_layout.addWidget(icon)
        layout.addWidget(icon_box, alignment=Qt.AlignmentFlag.AlignCenter)

        layout.addWidget(make_label(title, 25, TEXT, 800, Qt.AlignmentFlag.AlignCenter))
        layout.addWidget(make_label(description, 16, MUTED, 400, Qt.AlignmentFlag.AlignCenter))
        layout.addSpacing(8)

        for feature in ("♢  Secure & Encrypted", "☁  Seamless Sync", "⚙  Optimized Performance"):
            feature_label = make_label(feature, 15, "#d0d8e6", 500)
            feature_label.setStyleSheet("color: #d0d8e6; font-size: 15px; padding-left: 24px;")
            layout.addWidget(feature_label)

        layout.addStretch()
        button = make_button(f"Select {title}    ›", primary=primary)
        button.clicked.connect(lambda: self.main_window.show_loader(self.title))
        layout.addWidget(button)


class OSSelectionScreen(QWidget):
    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        self.build()

    def build(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        layout.addWidget(BrandPanel(compact=True, support_footer=True), stretch=4)

        content = QFrame()
        content.setObjectName("osContent")
        content.setStyleSheet(
            """
            QFrame#osContent {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #031022, stop:1 #071426);
            }
            """
        )
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(58, 58, 58, 38)
        content_layout.setSpacing(20)

        content_layout.addWidget(
            make_label(
                "Select Your Operating System",
                30,
                TEXT,
                800,
                Qt.AlignmentFlag.AlignCenter,
            )
        )
        content_layout.addWidget(
            make_label(
                "Choose the platform you want to use with Cloud OS",
                19,
                MUTED,
                400,
                Qt.AlignmentFlag.AlignCenter,
            )
        )
        content_layout.addSpacing(18)

        cards = QHBoxLayout()
        cards.setSpacing(30)
        cards.addWidget(
            OSCard(
                "Windows OS",
                "Install Cloud OS on your Windows PC and access your cloud workspace.",
                "window_logo.png",
                True,
                self.main_window,
            )
        )
        cards.addWidget(
            OSCard(
                "macOS",
                "Install Cloud OS on your Mac and experience seamless productivity.",
                "mac_logo.jpg",
                False,
                self.main_window,
            )
        )
        content_layout.addLayout(cards, stretch=1)

        help_text = QLabel("?  Not sure which one to choose? <span style='color:#1298ff;'>Learn more</span>")
        help_text.setTextFormat(Qt.TextFormat.RichText)
        help_text.setAlignment(Qt.AlignmentFlag.AlignCenter)
        help_text.setStyleSheet("color: #c5ccda; font-size: 15px;")
        content_layout.addWidget(help_text)

        back = QPushButton("←  Back to Login")
        back.setCursor(Qt.CursorShape.PointingHandCursor)
        back.clicked.connect(self.main_window.show_login)
        back.setStyleSheet(
            """
            QPushButton {
                background: transparent;
                color: #1298ff;
                border: none;
                font-size: 15px;
                padding: 8px;
            }
            QPushButton:hover { color: #60bfff; }
            """
        )
        content_layout.addWidget(back, alignment=Qt.AlignmentFlag.AlignCenter)

        layout.addWidget(content, stretch=11)


class LoaderScreen(QWidget):
    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        self.background = None
        self.animation = QPropertyAnimation()
        self.video_capture = None
        self.video_frame_count = 0
        self.video_frame_index = 0
        self.video_playable_frame_count = 0
        self.current_os_name = None
        self.video_timer = QTimer(self)
        self.video_timer.timeout.connect(self.render_video_frame)

        self.layout = QVBoxLayout(self)
        self.layout.setContentsMargins(0, 0, 0, 0)
        self.layout.setSpacing(0)

        self.stage = QFrame()
        self.stage.setStyleSheet("background: #000000;")
        self.layout.addWidget(self.stage, stretch=1)

        self.stage_layout = QStackedLayout(self.stage)
        self.stage_layout.setContentsMargins(0, 0, 0, 0)
        self.stage_layout.setStackingMode(QStackedLayout.StackingMode.StackAll)

        self.image = QLabel()
        self.image.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.image.setStyleSheet("background: #000000;")
        self.stage_layout.addWidget(self.image)

        self.overlay = QFrame()
        self.overlay.setStyleSheet("background: transparent;")
        overlay_layout = QVBoxLayout(self.overlay)
        overlay_layout.setContentsMargins(0, 0, 0, 90)
        overlay_layout.addStretch()

        self.progress = QProgressBar()
        self.progress.setFixedSize(220, 8)
        self.progress.setTextVisible(False)
        self.progress.setRange(0, 100)
        self.progress.setStyleSheet(
            """
            QProgressBar {
                background: rgba(255,255,255,0.20);
                border: none;
                border-radius: 4px;
            }
            QProgressBar::chunk {
                background: rgba(255,255,255,0.86);
                border-radius: 4px;
            }
            """
        )
        overlay_layout.addWidget(self.progress, alignment=Qt.AlignmentFlag.AlignCenter)

        back = QPushButton("Back")
        back.setCursor(Qt.CursorShape.PointingHandCursor)
        back.clicked.connect(self.main_window.show_os_selection)
        back.setStyleSheet(
            """
            QPushButton {
                background: rgba(255,255,255,0.08);
                color: rgba(255,255,255,0.82);
                border: 1px solid rgba(255,255,255,0.16);
                border-radius: 8px;
                padding: 8px 18px;
            }
            QPushButton:hover { background: rgba(255,255,255,0.14); }
            """
        )
        overlay_layout.addWidget(back, alignment=Qt.AlignmentFlag.AlignCenter)
        self.stage_layout.addWidget(self.overlay)

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.refresh_background()

    def start(self, os_name):
        self.current_os_name = os_name
        self.progress.setValue(0)
        self.animation.stop()
        self.stop_video()

        video_name = "macboot.mp4" if os_name == "macOS" else "WindowsBoot.mp4"
        video_path = asset_path(video_name)
        if os.path.exists(video_path) and cv2 is not None:
            self.background = None
            self.image.clear()
            self.image.show()
            trim_end_seconds = 5 if os_name == "Windows OS" else 0
            playback_speed = 2.5 if os_name == "macOS" else 1.0
            self.start_video(video_path, trim_end_seconds, playback_speed)
        else:
            self.show_fallback_image(os_name)

    def stop(self):
        self.animation.stop()
        self.stop_video()

    def start_video(self, video_path, trim_end_seconds=0, playback_speed=1.0):
        self.video_capture = cv2.VideoCapture(video_path)
        if not self.video_capture.isOpened():
            self.show_fallback_image("macOS" if "mac" in os.path.basename(video_path).lower() else "Windows OS")
            return

        fps = self.video_capture.get(cv2.CAP_PROP_FPS) or 30
        playback_speed = max(playback_speed, 0.1)
        self.video_frame_count = int(self.video_capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        trim_frames = int(fps * trim_end_seconds)
        self.video_playable_frame_count = max(1, self.video_frame_count - trim_frames) if self.video_frame_count else 0
        self.video_frame_index = 0
        self.video_timer.start(max(8, int(1000 / (fps * playback_speed))))

    def stop_video(self):
        self.video_timer.stop()
        if self.video_capture is not None:
            self.video_capture.release()
            self.video_capture = None

    def render_video_frame(self):
        if self.video_capture is None:
            return

        if self.video_playable_frame_count and self.video_frame_index >= self.video_playable_frame_count:
            self.finish_boot()
            return

        ok, frame = self.video_capture.read()
        if not ok:
            self.finish_boot()
            return

        self.video_frame_index += 1
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        height, width, channels = rgb_frame.shape
        bytes_per_line = channels * width
        frame_image = QImage(
            rgb_frame.data,
            width,
            height,
            bytes_per_line,
            QImage.Format.Format_RGB888,
        ).copy()
        self.background = QPixmap.fromImage(frame_image)
        self.refresh_background()

        progress_total = self.video_playable_frame_count or self.video_frame_count
        if progress_total > 0:
            self.progress.setValue(min(100, int((self.video_frame_index / progress_total) * 100)))

    def show_fallback_image(self, os_name):
        self.stop_video()
        image_name = "mac_loader_screen.jpg" if os_name == "macOS" else "window_loader.jfif"
        self.background = QPixmap(asset_path(image_name))
        self.refresh_background()
        self.image.show()
        self.animation = QPropertyAnimation(self.progress, b"value", self)
        self.animation.setDuration(2800)
        self.animation.setStartValue(8)
        self.animation.setEndValue(100)
        self.animation.finished.connect(self.finish_boot)
        self.animation.start()

    def finish_boot(self):
        self.video_timer.stop()
        self.progress.setValue(100)
        if self.current_os_name:
            self.main_window.show_lock_screen(self.current_os_name)

    def refresh_background(self):
        if self.background and not self.background.isNull():
            self.image.setPixmap(
                self.background.scaled(
                    self.image.size(),
                    Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                    Qt.TransformationMode.SmoothTransformation,
                )
            )


class LockScreen(QWidget):
    def __init__(self, main_window):
        super().__init__()
        self.main_window = main_window
        self.os_name = "Windows OS"
        self.background = QPixmap()
        self.source_size = None

        self.setStyleSheet("background: transparent;")

        self.background_label = QLabel(self)
        self.background_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.background_label.setStyleSheet("background: transparent;")

        self.avatar_label = QLabel(self)
        self.avatar_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.user_label = QLabel("", self)
        self.user_label.setAlignment(Qt.AlignmentFlag.AlignCenter)

        self.password_input = QLineEdit(self)
        self.password_input.setPlaceholderText("Password")
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.returnPressed.connect(self.submit_password)

        self.submit_button = QPushButton(">", self)
        self.submit_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.submit_button.clicked.connect(self.submit_password)

        self.message = QLabel("", self)
        self.message.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.message.hide()

        self.power_button = QPushButton("", self)
        self.power_button.setCursor(Qt.CursorShape.PointingHandCursor)
        self.power_button.clicked.connect(self.main_window.show_login)

        self.power_text = QLabel("Power Off", self)
        self.power_text.setAlignment(Qt.AlignmentFlag.AlignCenter)

    def start(self, os_name):
        self.os_name = os_name
        image_name = "mac_lock_wallpaper.png" if os_name == "macOS" else "windows_lock_wallpaper.png"
        self.background = QPixmap(asset_path(image_name))
        self.source_size = self.background.size() if not self.background.isNull() else None
        self.password_input.clear()
        self.message.hide()
        self.apply_lock_style()
        self.refresh_background()
        self.position_controls()
        self.password_input.setFocus()

    def resizeEvent(self, event):
        super().resizeEvent(event)
        self.background_label.setGeometry(self.rect())
        self.refresh_background()
        self.position_controls()

    def refresh_background(self):
        if self.background.isNull():
            return
        self.background_label.setPixmap(
            self.background.scaled(
                self.background_label.size(),
                Qt.AspectRatioMode.KeepAspectRatioByExpanding,
                Qt.TransformationMode.SmoothTransformation,
            )
        )

    def image_rect_to_widget(self, rect):
        if not self.source_size or self.source_size.isEmpty():
            return rect

        widget_width = max(self.width(), 1)
        widget_height = max(self.height(), 1)
        source_width = self.source_size.width()
        source_height = self.source_size.height()
        scale = max(widget_width / source_width, widget_height / source_height)
        scaled_width = source_width * scale
        scaled_height = source_height * scale
        offset_x = (widget_width - scaled_width) / 2
        offset_y = (widget_height - scaled_height) / 2
        x, y, width, height = rect
        return (
            int(offset_x + x * scale),
            int(offset_y + y * scale),
            max(1, int(width * scale)),
            max(1, int(height * scale)),
        )

    def position_controls(self):
        if self.os_name == "macOS":
            avatar_rect = self.image_rect_to_widget((786, 322, 100, 100))
            user_rect = self.image_rect_to_widget((720, 432, 232, 26))
            input_rect = self.image_rect_to_widget((696, 470, 256, 34))
            button_rect = self.image_rect_to_widget((952, 470, 34, 34))
            power_button_rect = self.image_rect_to_widget((818, 808, 36, 36))
            power_text_rect = self.image_rect_to_widget((776, 850, 120, 24))
            self.avatar_label.setGeometry(*avatar_rect)
            self.user_label.setGeometry(*user_rect)
            self.password_input.setGeometry(*input_rect)
            self.submit_button.setGeometry(*button_rect)
            self.submit_button.show()
            self.power_button.setGeometry(*power_button_rect)
            self.power_text.setGeometry(*power_text_rect)
            self.power_button.show()
            self.power_text.show()
            message_rect = self.image_rect_to_widget((696, 510, 290, 28))
        else:
            avatar_rect = self.image_rect_to_widget((771, 302, 130, 130))
            user_rect = self.image_rect_to_widget((720, 448, 230, 36))
            input_rect = self.image_rect_to_widget((675, 515, 300, 40))
            button_rect = self.image_rect_to_widget((975, 515, 44, 40))
            power_button_rect = self.image_rect_to_widget((1588, 858, 44, 44))
            self.avatar_label.setGeometry(*avatar_rect)
            self.user_label.setGeometry(*user_rect)
            self.password_input.setGeometry(*input_rect)
            self.submit_button.setGeometry(*button_rect)
            self.submit_button.show()
            self.power_button.setGeometry(*power_button_rect)
            self.power_button.show()
            self.power_text.hide()
            message_rect = self.image_rect_to_widget((675, 562, 344, 30))

        self.message.setGeometry(*message_rect)
        self.avatar_label.raise_()
        self.user_label.raise_()
        self.password_input.raise_()
        self.submit_button.raise_()
        self.message.raise_()
        self.power_button.raise_()
        self.power_text.raise_()

    def apply_lock_style(self):
        if self.os_name == "macOS":
            self.set_icon_label(self.avatar_label, "fa5s.fingerprint", "⌾", 48, "#ffffff")
            self.set_button_icon(self.power_button, "fa5s.power-off", "⏻", 22, "#ffffff")
            self.avatar_label.setStyleSheet(
                """
                QLabel {
                    background: rgba(255, 255, 255, 0.20);
                    border: 1px solid rgba(255, 255, 255, 0.45);
                    border-radius: 50px;
                }
                """
            )
            self.user_label.setText("")
            self.user_label.setStyleSheet("color: #ffffff; font-size: 17px; font-weight: 600;")
            self.password_input.setStyleSheet(
                """
                QLineEdit {
                    background: rgba(255, 255, 255, 0.34);
                    border: 1px solid rgba(255, 255, 255, 0.38);
                    border-radius: 17px;
                    color: #111827;
                    padding: 0 14px;
                    font-size: 16px;
                }
                QLineEdit::placeholder { color: rgba(255, 255, 255, 0.72); }
                """
            )
            self.submit_button.setStyleSheet(
                """
                QPushButton {
                    background: rgba(255, 255, 255, 0.26);
                    border: none;
                    border-radius: 17px;
                    color: #ffffff;
                    font-size: 19px;
                    font-weight: 300;
                }
                QPushButton:hover { background: rgba(255, 255, 255, 0.34); }
                """
            )
            self.message.setStyleSheet("color: #ffffff; font-size: 11px;")
            self.power_button.setStyleSheet(
                """
                QPushButton {
                    background: rgba(0, 0, 0, 0.10);
                    border: 1px solid rgba(255, 255, 255, 0.34);
                    border-radius: 18px;
                    color: #ffffff;
                }
                QPushButton:hover { background: rgba(255, 255, 255, 0.18); }
                """
            )
            self.power_text.setText("Power Off")
            self.power_text.setStyleSheet("color: #ffffff; font-size: 13px;")
        else:
            self.set_icon_label(self.avatar_label, "fa5s.user", "U", 62, "#ffffff")
            self.set_button_icon(self.power_button, "fa5s.power-off", "⏻", 26, "#ffffff")
            self.avatar_label.setStyleSheet(
                """
                QLabel {
                    background: rgba(104, 104, 104, 0.96);
                    border-radius: 65px;
                }
                """
            )
            self.user_label.setText("")
            self.user_label.setStyleSheet("color: rgba(255, 255, 255, 0.92); font-size: 20px; font-weight: 500;")
            self.password_input.setStyleSheet(
                """
                QLineEdit {
                    background: #f7f7f7;
                    border: 1px solid rgba(255, 255, 255, 0.45);
                    color: #111827;
                    padding: 0 9px;
                    font-size: 15px;
                }
                QLineEdit::placeholder { color: #8b8b8b; }
                """
            )
            self.submit_button.setStyleSheet(
                """
                QPushButton {
                    background: rgba(42, 59, 79, 0.92);
                    border: 1px solid rgba(255, 255, 255, 0.34);
                    color: #ffffff;
                    font-size: 22px;
                    font-weight: 300;
                }
                QPushButton:hover { background: rgba(61, 83, 110, 0.98); }
                """
            )
            self.message.setStyleSheet("color: rgba(255, 255, 255, 0.88); font-size: 14px;")
            self.power_button.setStyleSheet(
                """
                QPushButton {
                    background: rgba(0, 0, 0, 0.10);
                    border: 1px solid rgba(255, 255, 255, 0.28);
                    border-radius: 22px;
                    color: #ffffff;
                }
                QPushButton:hover { background: rgba(255, 255, 255, 0.14); }
                """
            )

    def set_icon_label(self, label, icon_name, fallback, size, color):
        icon = fontawesome_icon(icon_name, color)
        if icon is not None:
            label.setPixmap(icon.pixmap(size, size))
            label.setText("")
        else:
            label.setPixmap(QPixmap())
            label.setText(fallback)
            label.setStyleSheet(f"color: {color}; font-size: {size}px;")

    def set_button_icon(self, button, icon_name, fallback, size, color):
        icon = fontawesome_icon(icon_name, color)
        if icon is not None:
            button.setIcon(icon)
            button.setIconSize(QSize(size, size))
            button.setText("")
        else:
            button.setIcon(QIcon())
            button.setText(fallback)

    def submit_password(self):
        if not self.password_input.text().strip():
            self.message.setText("Enter your default password")
            self.message.show()
            return

        self.message.setText("Password accepted")
        self.message.show()


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Cloud OS")
        self.setMinimumSize(1080, 720)
        self.resize(1280, 820)
        self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Window)
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.build()

    def build(self):
        shell = QFrame()
        shell.setObjectName("shell")
        shell.setStyleSheet(
            """
            QFrame#shell {
                background: #020813;
                border: 1px solid rgba(148, 163, 184, 0.20);
                border-radius: 10px;
            }
            """
        )
        self.setCentralWidget(shell)

        layout = QVBoxLayout(shell)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        self.title_bar = TitleBar(self)
        layout.addWidget(self.title_bar)

        self.stacked_widget = QStackedWidget()
        self.login_screen = LoginScreen(self)
        self.register_screen = RegisterScreen(self)
        self.os_screen = OSSelectionScreen(self)
        self.loader_screen = LoaderScreen(self)
        self.lock_screen = LockScreen(self)

        self.stacked_widget.addWidget(self.login_screen)
        self.stacked_widget.addWidget(self.register_screen)
        self.stacked_widget.addWidget(self.os_screen)
        self.stacked_widget.addWidget(self.loader_screen)
        self.stacked_widget.addWidget(self.lock_screen)
        layout.addWidget(self.stacked_widget)

    def show_login(self):
        self.title_bar.show()
        self.loader_screen.stop()
        self.stacked_widget.setCurrentWidget(self.login_screen)

    def show_register(self):
        self.title_bar.show()
        self.loader_screen.stop()
        self.stacked_widget.setCurrentWidget(self.register_screen)

    def show_signup(self):
        self.show_register()

    def show_os_selection(self):
        self.title_bar.show()
        self.loader_screen.stop()
        self.stacked_widget.setCurrentWidget(self.os_screen)

    def show_loader(self, os_name):
        self.title_bar.show()
        self.stacked_widget.setCurrentWidget(self.loader_screen)
        self.loader_screen.start(os_name)

    def show_lock_screen(self, os_name):
        self.title_bar.show()
        self.loader_screen.stop()
        self.lock_screen.start(os_name)
        self.stacked_widget.setCurrentWidget(self.lock_screen)


if __name__ == "__main__":
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    font = QFont("Segoe UI")
    font.setPointSize(10)
    app.setFont(font)

    window = MainWindow()
    window.show()
    sys.exit(app.exec())
