"""Generate editable Luvia pattern documents (requires python-docx)."""
import argparse
from io import BytesIO
from pathlib import Path
from secrets import token_urlsafe
from xml.sax.saxutils import escape
from uuid import uuid4
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docx.table import Table as WordTable
from docx.text.paragraph import Paragraph as WordParagraph

ROOT = Path(__file__).resolve().parents[1]
COCOA = "5D4037"
MUSTARD = "F6C453"
CREAM = "FFFAF0"
COPYRIGHT = (
    "Copyright (c) Luvia Creations. All rights reserved. Copying, editing, sharing or distributing "
    "this document without the prior explicit written consent of Luvia Creations is prohibited, "
    "except as permitted by applicable law. Printing for the agreed artisan work is allowed."
)


def embed_hindi_font(document, destination):
    family = "Noto Sans Devanagari"
    for style in document.styles:
        if style.type in (1, 2):
            style.font.name = family
            fonts = style.element.get_or_add_rPr().get_or_add_rFonts()
            for script in ("ascii", "hAnsi", "cs", "eastAsia"):
                fonts.set(qn("w:" + script), family)
    def apply(container):
        for paragraph in container.paragraphs:
            for run in paragraph.runs:
                run.font.name = family
                fonts = run._element.get_or_add_rPr().get_or_add_rFonts()
                for script in ("ascii", "hAnsi", "cs", "eastAsia"):
                    fonts.set(qn("w:" + script), family)
        for grid in container.tables:
            for row in grid.rows:
                for cell in row.cells:
                    apply(cell)
    apply(document)
    for section in document.sections:
        apply(section.header)
        apply(section.footer)
    document.settings.element.append(OxmlElement("w:embedTrueTypeFonts"))
    document.save(destination)
    with ZipFile(destination) as package:
        files = {name: package.read(name) for name in package.namelist()}
    key = uuid4()
    font = bytearray((ROOT / "public" / "fonts" / "NotoSansDevanagari-Regular.ttf").read_bytes())
    mask = key.bytes[::-1]
    for index in range(32):
        font[index] ^= mask[index % 16]
    files["word/fonts/LuviaHindi.odttf"] = bytes(font)
    fonts = etree.fromstring(files["word/fontTable.xml"])
    entry = OxmlElement("w:font")
    entry.set(qn("w:name"), family)
    embed = OxmlElement("w:embedRegular")
    embed.set(qn("r:id"), "rIdLuviaHindi")
    embed.set(qn("w:fontKey"), "{" + str(key).upper() + "}")
    entry.append(embed)
    fonts.append(entry)
    files["word/fontTable.xml"] = etree.tostring(fonts, xml_declaration=True, encoding="UTF-8")
    relationships = b'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'
    rels = etree.fromstring(files.get("word/_rels/fontTable.xml.rels", relationships))
    etree.SubElement(rels, "{http://schemas.openxmlformats.org/package/2006/relationships}Relationship",
                     Id="rIdLuviaHindi", Target="fonts/LuviaHindi.odttf",
                     Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font")
    files["word/_rels/fontTable.xml.rels"] = etree.tostring(rels, xml_declaration=True, encoding="UTF-8")
    types = etree.fromstring(files["[Content_Types].xml"])
    etree.SubElement(types, "{http://schemas.openxmlformats.org/package/2006/content-types}Default",
                     Extension="odttf", ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont")
    files["[Content_Types].xml"] = etree.tostring(types, xml_declaration=True, encoding="UTF-8")
    with ZipFile(destination, "w", ZIP_DEFLATED) as package:
        for name, content in files.items():
            package.writestr(name, content)


def shade(cell, fill):
    element = OxmlElement("w:shd")
    element.set(qn("w:fill"), fill)
    cell._tc.get_or_add_tcPr().append(element)


def table(document, headers, rows):
    result = document.add_table(rows=1, cols=len(headers))
    result.style = "Table Grid"
    for cell, label in zip(result.rows[0].cells, headers):
        cell.text = label
        shade(cell, MUSTARD)
        for run in cell.paragraphs[0].runs:
            run.bold = True
    for values in rows:
        for cell, value in zip(result.add_row().cells, values):
            cell.text = value
            shade(cell, CREAM)
    document.add_paragraph()
    return result


def branded(title, subtitle):
    document = Document()
    section = document.sections[0]
    section.top_margin = Inches(1.3)
    section.bottom_margin = Inches(0.65)
    section.header_distance = Inches(0.2)
    section.left_margin = section.right_margin = Inches(0.7)
    section.page_width, section.page_height = Inches(8.27), Inches(11.69)
    normal = document.styles["Normal"]
    normal.font.name = "Calibri"
    normal.font.size = Pt(10)
    normal.font.color.rgb = RGBColor.from_string(COCOA)
    normal.paragraph_format.space_after = Pt(6)
    for name in ["Title", "Heading 1", "Heading 2"]:
        document.styles[name].font.name = "Calibri"
        document.styles[name].font.color.rgb = RGBColor.from_string(COCOA)
    header = section.header.paragraphs[0]
    header.alignment = WD_ALIGN_PARAGRAPH.CENTER
    header.add_run().add_picture(str(ROOT / "public" / "images" / "luvia-pattern-logo.jpg"), width=Inches(0.75))
    tagline = section.header.add_paragraph("LUVIA CREATIONS | MADE WITH LOVE")
    tagline.alignment = WD_ALIGN_PARAGRAPH.CENTER
    tagline.runs[0].font.size = Pt(8)
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer.add_run("Luvia Creations | Artisan working pattern | Page ")
    field = OxmlElement("w:fldSimple")
    field.set(qn("w:instr"), "PAGE")
    footer._p.append(field)
    document.add_paragraph(COPYRIGHT).runs[0].bold = True
    document.add_heading(title, 0).alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.add_paragraph(subtitle).alignment = WD_ALIGN_PARAGRAPH.CENTER
    document.core_properties.author = "Luvia Creations"
    document.core_properties.title = title
    table(document, ["Document control", "Details"], [
        ("Product / SKU", "[Filled automatically during admin preparation]"),
        ("Pattern ID / revision / date", "[Assigned automatically during admin preparation] / [Version] / [Date]"),
        ("Prepared by / reviewed by", "Luvia Creations / [Reviewer - pending review]"),
        ("Skill level / terminology", "[Beginner / Intermediate / Advanced] / US crochet terms"),
        ("Finished size / tolerance", "[Dimensions in cm] / [Allowed variation]"),
        ("Hook / yarn / gauge", "[Hook size in mm] / [Yarn specification] / [Gauge and swatch size]"),
    ])
    return document


def product_reference(document, url=None, photo=None):
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if url:
        from urllib.parse import urlparse
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname != "luviacreations.com" or not parsed.path.startswith("/p/"):
            raise ValueError("Use the product's https://luviacreations.com/p/.../ link.")
        hyperlink = OxmlElement("w:hyperlink")
        hyperlink.set(qn("r:id"), document.part.relate_to(
            url, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", is_external=True))
        run = OxmlElement("w:r")
        text = OxmlElement("w:t")
        text.text = url
        run.append(text)
        hyperlink.append(run)
        paragraph._p.append(hyperlink)
    else:
        paragraph.add_run("Product link: [Paste the product page URL]")
    paragraph = document.add_paragraph()
    paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if photo:
        from PIL import Image
        image = BytesIO()
        with Image.open(photo) as original:
            original.convert("RGB").save(image, format="PNG")
        image.seek(0)
        paragraph.add_run().add_picture(image, width=Inches(2.4))
    else:
        paragraph.add_run("[Insert this product's main photo]")


def protected_pdf(document, destination):
    import pymupdf
    from reportlab.lib import colors
    from reportlab.lib.enums import TA_CENTER
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, LongTable, TableStyle, Image, Spacer

    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle("Luvia", fontName="Helvetica", fontSize=9, leading=13,
                             textColor=colors.HexColor("#" + COCOA), spaceAfter=7))
    story = []
    for block in document.iter_inner_content():
        if isinstance(block, WordTable):
            rows = [[Paragraph(escape(cell.text).replace("\n", "<br/>"), styles["Luvia"])
                     for cell in row.cells] for row in block.rows]
            grid = LongTable(rows, colWidths=[(A4[0] - 88) / len(rows[0])] * len(rows[0]), repeatRows=1)
            grid.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#" + MUSTARD)),
                ("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#" + CREAM)),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#D4C0AF")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 7),
            ]))
            story.extend([grid, Spacer(1, 10)])
        elif isinstance(block, WordParagraph):
            for drawing in block._p.xpath(".//a:blip"):
                image = document.part.related_parts[drawing.get(qn("r:embed"))].blob
                picture = Image(BytesIO(image))
                ratio = min(175 / picture.imageWidth, 175 / picture.imageHeight)
                picture.drawWidth = picture.imageWidth * ratio
                picture.drawHeight = picture.imageHeight * ratio
                picture.hAlign = "CENTER"
                story.extend([picture, Spacer(1, 10)])
            text = escape(block.text).replace("\n", "<br/>")
            for link in block._p.xpath("./w:hyperlink"):
                target = document.part.rels[link.get(qn("r:id"))].target_ref
                label = "".join(link.xpath(".//w:t/text()"))
                linked = f'<link href="{escape(target)}" color="#5d4037">{escape(label)}</link>'
                text = text.replace(escape(label), linked, 1) if escape(label) in text else text + linked
            if text:
                heading = block.style.name in ["Title", "Heading 1", "Heading 2"]
                style = ParagraphStyle("block", parent=styles["Luvia"],
                                       fontName="Helvetica-Bold" if heading else "Helvetica",
                                       fontSize=16 if block.style.name == "Title" else 11 if heading else 9,
                                       leading=19 if block.style.name == "Title" else 14,
                                       alignment=TA_CENTER if block.alignment == WD_ALIGN_PARAGRAPH.CENTER else 0,
                                       keepWithNext=heading)
                story.append(Paragraph(text, style))
    def page(canvas, doc):
        canvas.setFillColor(colors.HexColor("#" + CREAM))
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        canvas.drawImage(str(ROOT / "public" / "images" / "luvia-pattern-logo.jpg"), A4[0] / 2 - 27, A4[1] - 70,
                         width=54, height=54, preserveAspectRatio=True)
        canvas.setFillColor(colors.HexColor("#" + COCOA))
        canvas.setFont("Helvetica", 8)
        canvas.drawCentredString(A4[0] / 2, A4[1] - 82, "LUVIA CREATIONS | MADE WITH LOVE")
        canvas.drawCentredString(A4[0] / 2, 24, f"Luvia Creations | Private artisan pattern | Page {doc.page}")
    raw = BytesIO()
    SimpleDocTemplate(raw, pagesize=A4, topMargin=100, bottomMargin=44, leftMargin=44, rightMargin=44).build(
        story, onFirstPage=page, onLaterPages=page)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with pymupdf.open(stream=raw.getvalue(), filetype="pdf") as pdf:
        pdf.save(str(destination), encryption=pymupdf.PDF_ENCRYPT_AES_256,
                 owner_pw=token_urlsafe(24), user_pw="",
                 permissions=pymupdf.PDF_PERM_PRINT | pymupdf.PDF_PERM_PRINT_HQ)


def checks(document):
    document.add_heading("Quality & sample approval", 1)
    table(document, ["Check", "Acceptance / artisan notes"], [
        ("Size, gauge and colour", "[Match approved sample and agreed tolerance]"),
        ("Stitches and finishing", "[Even tension; secure joins; ends woven in]"),
        ("Product-specific safety checks", "[Applicable checks and reviewer; do not assume approval]"),
        ("Sample approval", "[Reviewer / date / approval reference - pending]"),
    ])
    document.add_heading("Batch handover & revision record", 1)
    table(document, ["Field", "Agreed details"], [
        ("Batch / quantity / due date", "[Confirm separately before starting]"),
        ("Rate / materials / courier terms", "[Reference the separately agreed batch terms]"),
        ("Artisan questions / changes", "[Record questions and approved changes]"),
        ("Revision history", "[Version / date / change / reviewer]"),
    ])
    document.add_paragraph(
        "Internal artisan working copy. Share only with the intended artisan. "
        "A pattern is not a work order: confirm quantity, rate, materials and timing separately. "
        "Do not start production until the sample and batch terms are approved."
    )


def template(destination):
    document = branded("Crochet pattern", "STANDARD WORKING TEMPLATE | Replace all bracketed fields before sharing.")
    product_reference(document)
    document.add_heading("1. Reference & construction", 1)
    document.add_paragraph("[Insert approved product photos, colour references and a construction overview here.]")
    document.add_heading("2. Materials & tools", 1)
    table(document, ["Item / colour", "Specification", "Quantity per piece"], [
        ("[Yarn / colour code]", "[Fibre / brand / weight]", "[Grams / metres]"),
        ("[Hook / notions]", "[Size / specification]", "[Quantity]"),
    ])
    document.add_heading("3. Abbreviations & special stitches", 1)
    document.add_paragraph("US terms: ch = chain; sl st = slip stitch; sc = single crochet; "
                           "hdc = half double crochet; dc = double crochet; tr = treble crochet; "
                           "st(s) = stitch(es); inc = increase. [Define any additional stitches.]")
    document.add_heading("4. Before you begin", 1)
    document.add_paragraph("[State turning / joining method, starting-chain convention, tension, "
                           "colour changes, repeat notation and special stitch instructions.]")
    document.add_heading("5. Step-by-step instructions", 1)
    table(document, ["Part / row / round", "Instructions / repeats", "End count / check"], [
        ("[Part A / R1]", "[Write full instructions]", "[Stitches / dimensions]"),
        ("[R2]", "[Write full instructions]", "[Stitches / dimensions]"),
        ("[Continue as needed]", "[Insert more editable rows]", "[Check]"),
    ])
    document.add_heading("6. Assembly, finishing & care", 1)
    document.add_paragraph("[Describe assembly order, attachment positions, weaving in ends, "
                           "shaping / blocking and confirmed care instructions.]")
    checks(document)
    destination.parent.mkdir(parents=True, exist_ok=True)
    document.save(destination)


def hindi_template(destination):
    document = branded("क्रोशिया पैटर्न", "मानक कार्य प्रारूप | भेजने से पहले सभी खाली विवरण भरें।")
    normal = document.styles["Normal"]
    normal.font.name = "Noto Sans Devanagari"
    normal.element.get_or_add_rPr().get_or_add_rFonts().set(qn("w:cs"), "Noto Sans Devanagari")
    for name in ["Title", "Heading 1", "Heading 2"]:
        document.styles[name].font.name = "Noto Sans Devanagari"
    controls = [
        ("दस्तावेज़ नियंत्रण", "विवरण"), ("उत्पाद / SKU", "[एडमिन में तैयारी के समय अपने आप भरा जाएगा]"),
        ("पैटर्न ID / संस्करण / तिथि", "[एडमिन में अपने आप बनेगा] / [संस्करण] / [तिथि]"),
        ("तैयार किया / समीक्षा की", "Luvia Creations / [समीक्षक का नाम]"),
        ("कौशल स्तर / शब्दावली", "[आसान / मध्यम / उन्नत] / US crochet terms"),
        ("तैयार आकार / स्वीकार्य अंतर", "[सेमी में माप] / [स्वीकार्य अंतर]"),
        ("हुक / धागा / गेज", "[हुक का आकार] / [धागे का विवरण] / [गेज]"),
    ]
    for row, labels in zip(document.tables[0].rows, controls):
        for cell, label in zip(row.cells, labels):
            cell.text = label
    for paragraph in document.paragraphs:
        if paragraph.text == COPYRIGHT:
            paragraph.text = ("कॉपीराइट (c) Luvia Creations। सर्वाधिकार सुरक्षित। Luvia Creations की पूर्व स्पष्ट लिखित "
                              "अनुमति के बिना इस दस्तावेज़ की नकल, संपादन, साझाकरण या वितरण निषिद्ध है, सिवाय लागू कानून "
                              "द्वारा अनुमत उपयोग के। सहमत कारीगर कार्य के लिए प्रिंट करना अनुमत है।")
    product_reference(document)
    for paragraph in document.paragraphs:
        if paragraph.text == "Product link: [Paste the product page URL]":
            paragraph.text = "उत्पाद का लिंक: [उत्पाद के पेज का URL लिखें]"
        elif paragraph.text == "[Insert this product's main photo]":
            paragraph.text = "[उत्पाद की मुख्य तस्वीर जोड़ें]"
    for heading, instructions in [
        ("1. सामग्री और औज़ार", "[धागे का प्रकार, रंग, मात्रा, हुक का आकार और अन्य औज़ार लिखें।]"),
        ("2. आकार और गेज", "[तैयार उत्पाद का आकार, स्वीकार्य अंतर और गेज नमूना लिखें।]"),
        ("3. टांकों के संक्षिप्त नाम", "US terms: ch = चेन; sl st = स्लिप स्टिच; sc = सिंगल क्रोशिया; "
         "hdc = हाफ डबल क्रोशिया; dc = डबल क्रोशिया; tr = ट्रेबल क्रोशिया।"),
        ("4. शुरू करने से पहले", "[राउंड जोड़ने, मोड़ने, रंग बदलने और धागे के तनाव के निर्देश लिखें।]"),
        ("5. पैटर्न के चरण", "[नीचे हर पंक्ति या राउंड के निर्देश और अंतिम टांकों की संख्या लिखें।]"),
    ]:
        document.add_heading(heading, 1)
        document.add_paragraph(instructions)
    table(document, ["भाग / राउंड", "निर्देश", "अंतिम गिनती / जाँच"], [
        ("[R1]", "[हिन्दी में निर्देश लिखें]", "[गिनती]"), ("[R2]", "[निर्देश]", "[गिनती]")])
    document.add_heading("6. जोड़ना और फिनिशिंग", 1)
    document.add_paragraph("[भागों को जोड़ने, धागे के सिरे छिपाने, आकार देने और देखभाल के निर्देश लिखें।]")
    document.add_heading("7. नमूना जाँच और स्वीकृति", 1)
    table(document, ["जाँच", "विवरण"], [
        ("आकार / रंग / फिनिशिंग", "[स्वीकृत नमूने से मिलान करें]"),
        ("नमूना स्वीकृति", "[समीक्षक / तिथि / स्वीकृति संदर्भ]"),
        ("बैच की शर्तें", "[मात्रा / दर / सामग्री / समय-सीमा पर अलग से सहमति लें]"),
        ("संस्करण", "[संस्करण / तिथि / बदलाव]")])
    destination.parent.mkdir(parents=True, exist_ok=True)
    embed_hindi_font(document, destination)


def lotus(source, destination, url=None, photo=None, pdf=None):
    original = Document(source)
    document = branded("Crochet Lotus Flower", "ARTISAN WORKING PATTERN | US terms | Draft - sample review required")
    document.tables[0].cell(1, 1).text = "Crochet Lotus Flower / [SKU]"
    product_reference(document, url, photo)
    document.add_paragraph("Source instructions are retained below. Confirm hook size, yarn specification, "
                           "gauge, final dimensions and round counts before production. "
                           "In particular, clarify R1-R3 counting and the R6/R7 loop placement with the pattern reviewer.")
    for paragraph in original.paragraphs[2:]:
        text = paragraph.text
        if not text:
            continue
        if text in ["Materials", "Abbreviations (US terms)", "Notes", "Quick Reference", "Pattern", "Finishing"]:
            document.add_heading(text, 1)
            if text == "Quick Reference":
                for source_table in original.tables:
                    rows = [[cell.text for cell in row.cells] for row in source_table.rows]
                    table(document, rows[0], rows[1:])
        elif paragraph.style.name.startswith("Heading"):
            document.add_heading(text, 2)
        else:
            document.add_paragraph(text)
    checks(document)
    destination.parent.mkdir(parents=True, exist_ok=True)
    document.save(destination)
    if pdf:
        protected_pdf(document, pdf)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--product-url")
    parser.add_argument("--product-photo", type=Path)
    parser.add_argument("--pdf", type=Path)
    parser.add_argument("--skip-templates", action="store_true", help="Leave open or separately edited master templates unchanged.")
    args = parser.parse_args()
    if bool(args.source) != bool(args.output):
        parser.error("--source and --output must be supplied together")
    if not args.skip_templates:
        template(ROOT / "public" / "templates" / "Luvia_Standard_Crochet_Pattern_v4.docx")
        hindi_template(ROOT / "public" / "templates" / "Luvia_Standard_Crochet_Pattern_Hindi_v4.docx")
    if args.source:
        lotus(args.source, args.output, args.product_url, args.product_photo, args.pdf)
