export const vietnameseIngredients={magnesium:['magie','magiê'],zinc:['kẽm'],iron:['sắt'],calcium:['canxi'],omega3:['dầu cá','dầu nhuyễn thể'],probiotic:['lợi khuẩn','men vi sinh'],reishi:['nấm linh chi'],folate:['axit folic','acid folic'],potassium:['kali'],selenium:['selen'],iodine:['iốt']};
// Aliases extend existing topic rows, never imply measured search popularity.
export const vietnameseKeywords={
 '失眠':['mất ngủ'],'睡眠':['giấc ngủ','ngủ ngon'],'睡眠质量':['chất lượng giấc ngủ'],'入睡困难':['khó ngủ'],
 '压力':['căng thẳng'],'焦虑':['lo âu'],'放松':['thư giãn'],'更年期':['mãn kinh'],'围绝经期':['tiền mãn kinh'],
 '女性激素平衡':['nội tiết tố nữ'],'胃胀':['đầy hơi','chướng bụng'],'消化':['tiêu hóa'],'肠道健康':['đường ruột'],
 '便秘':['táo bón'],'肠道菌群':['hệ vi sinh đường ruột'],'抗衰':['chống lão hóa'],'抗氧化':['chống oxy hóa','chống oxi hóa'],
 '皮肤弹性':['đàn hồi da'],'皮肤光泽':['sáng da'],'皱纹':['nếp nhăn'],'头发生长':['mọc tóc'],'头发稀疏':['rụng tóc'],
 '减重':['giảm cân'],'体重管理':['kiểm soát cân nặng'],'血糖支持':['đường huyết'],'心血管健康':['tim mạch'],
 '血压支持':['huyết áp'],'血液循环':['tuần hoàn máu'],'骨骼健康':['xương chắc khỏe','sức khỏe xương'],'骨密度':['mật độ xương'],
 '关节健康':['xương khớp','sức khỏe khớp'],'关节灵活性':['linh hoạt khớp'],'记忆力':['trí nhớ'],'专注力':['tập trung'],
 '脑部健康':['bổ não'],'免疫支持':['tăng cường miễn dịch','sức đề kháng'],'免疫健康':['hệ miễn dịch'],
 '肌肉增长':['tăng cơ'],'运动恢复':['phục hồi sau tập'],'能量支持':['năng lượng'],'眼部健康':['sức khỏe mắt'],
 '肝脏健康':['chức năng gan'],'肾脏健康':['chức năng thận'],'镁营养支持':['bổ sung magie'],'钙营养支持':['bổ sung canxi'],
 '锌营养支持':['bổ sung kẽm'],'铁营养支持':['bổ sung sắt'],'益生菌支持':['lợi khuẩn','men vi sinh'],'欧米伽3支持':['omega 3','omega-3','dầu cá'],
 '蛋白质补充':['bổ sung protein'],'膳食纤维支持':['chất xơ']
};
export function translateVietnameseTitle(value){
 const pairs=[['hỗ trợ','支持'],['tăng cường','增强'],['viên nang mềm','软胶囊'],['viên nang','胶囊'],['viên sủi','泡腾片'],['viên uống','口服补充剂'],['bổ sung','补充'],['thực phẩm bảo vệ sức khỏe','膳食补充剂'],['thực phẩm chức năng','膳食补充剂'],['dầu nhuyễn thể','磷虾油'],['dầu cá','鱼油'],['thảo dược','草本'],['thận','肾脏'],['bàng quang','膀胱'],['canxi','钙'],['magie','镁'],['kẽm','锌'],['vitamin nhóm b','复合维生素B'],['vitamin tổng hợp','复合维生素'],['trắng da','亮肤'],['mờ nám','淡斑'],['nội tiết tố nữ','女性激素'],['bổ não','脑部营养'],['thuỷ phân','水解'],['thủy phân','水解'],['chống lão hóa','抗衰老'],['của mỹ','美国'],['hàng chuẩn mỹ','美国进口（商家宣称）'],['chính hãng','正品（商家宣称）'],['viên','粒']];
 let text=value;for(const [a,b] of pairs)text=text.replace(new RegExp(a,'gi'),b+' ');return text.replace(/\s+/g,' ').trim();
}
