// The Meloir mark, matching assets/logo.svg: a white disc with an M cut out of it.
using System.Drawing;
using System.Drawing.Drawing2D;

public static class MeloirLogo
{
    // The outline of the M on a 100 by 100 square, the same points as the SVG path.
    static readonly float[] Outline = { 26, 27, 37, 27, 50, 49, 63, 27, 74, 27, 74, 73, 63, 73, 63, 46, 50, 68, 37, 46, 37, 73, 26, 73 };

    public static void Draw(Graphics g, RectangleF area, Color disc, Color mark)
    {
        SmoothingMode previous = g.SmoothingMode;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        float u = area.Width / 100f;
        using (SolidBrush brush = new SolidBrush(disc)) g.FillEllipse(brush, area);
        PointF[] points = new PointF[Outline.Length / 2];
        for (int i = 0; i < points.Length; i++) points[i] = new PointF(area.X + Outline[i * 2] * u, area.Y + Outline[i * 2 + 1] * u);
        using (SolidBrush brush = new SolidBrush(mark)) g.FillPolygon(brush, points);
        g.SmoothingMode = previous;
    }
}
