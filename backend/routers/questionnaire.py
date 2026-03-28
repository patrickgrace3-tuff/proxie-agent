from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
import json

from db.database import db, row_to_dict
from db.auth import get_current_user

router = APIRouter()

QUESTIONS = [
    {"id":"zip_code","question":"What is your home zip code?","field":"zip_code","placeholder":"e.g. 37122","required":True},
    {"id":"licenses_held","question":"Which CDL licenses do you currently hold?","field":"licenses_held","type":"multi_select","options":["Class A","Class B","Class C"],"required":True},
    {"id":"licenses_obtaining","question":"Which licenses are you currently obtaining?","field":"licenses_obtaining","type":"multi_select","options":["Class A","Class B","Class C","None"]},
    {"id":"cdl_experience","question":"How many years of CDL driving experience do you have?","field":"cdl_experience","type":"single_select","options":["Less than 1 year","1-2 years","3-5 years","6-10 years","10+ years"],"required":True},
    {"id":"endorsements","question":"Which endorsements do you have?","field":"endorsements","type":"multi_select","options":["Hazmat (H)","Tanker (N)","Doubles/Triples (T)","Passenger (P)","School Bus (S)","None"]},
    {"id":"military_service","question":"Do you have military driving experience?","field":"military_service","type":"single_select","options":["Yes","No"]},
    {"id":"moving_violations","question":"Any moving violations in the last 3 years?","field":"moving_violations","type":"single_select","options":["Yes","No"],"required":True},
    {"id":"preventable_accidents","question":"Any preventable accidents in the last 3 years?","field":"preventable_accidents","type":"single_select","options":["Yes","No"],"required":True},
    {"id":"driver_type","question":"What type of driving are you looking for?","field":"driver_type","type":"single_select","options":["Company Driver","Owner Operator","Lease Purchase","Any"],"required":True},
    {"id":"owner_operator_interest","question":"Are you interested in Owner Operator opportunities?","field":"owner_operator_interest","type":"single_select","options":["Yes","No","Maybe"]},
    {"id":"solo_or_team","question":"Do you prefer solo or team driving?","field":"solo_or_team","type":"single_select","options":["Solo only","Team only","Either"]},
    {"id":"team_interest","question":"Would you consider team driving for higher pay?","field":"team_interest","type":"single_select","options":["Yes","No"]},
    {"id":"freight_current","question":"What freight types have you hauled?","field":"freight_current","type":"multi_select","options":["Dry Van","Refrigerated (Reefer)","Flatbed","Tanker","Hazmat","Intermodal","Auto Hauler","LTL","None yet"]},
    {"id":"freight_interested","question":"What freight types interest you most?","field":"freight_interested","type":"multi_select","options":["Dry Van","Refrigerated (Reefer)","Flatbed","Tanker","Hazmat","Intermodal","Auto Hauler","No preference"]},
    {"id":"best_contact_time","question":"When is the best time for recruiters to reach you?","field":"best_contact_time","type":"single_select","options":["Morning (6am-12pm)","Afternoon (12pm-5pm)","Evening (5pm-9pm)","Anytime"]},
    {"id":"career_goals","question":"Briefly describe your career goals (optional)","field":"career_goals","placeholder":"e.g. Looking for home weekly with at least 55 CPM..."},
    {"id":"agreed_to_terms","question":"By continuing, you agree to our Terms of Service and Privacy Policy.","field":"agreed_to_terms","type":"single_select","options":["Yes, I agree to the Terms of Service & Privacy Policy."]},
]


@router.get("/questions")
def get_questions():
    return {"questions": QUESTIONS}


@router.get("/profile")
def get_profile(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("SELECT * FROM profiles WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    return row_to_dict(row) if row else {}


class AnswerItem(BaseModel):
    field: str
    value: str
    is_list: bool = False


class CompleteSetupRequest(BaseModel):
    answers: list[AnswerItem]


@router.post("/submit")
def submit_answers(request: CompleteSetupRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    LIST_FIELDS = {"licenses_held","licenses_obtaining","endorsements","freight_current","freight_interested"}
    fields = {}
    for ans in request.answers:
        f, v = ans.field, ans.value
        if not v:
            continue
        if ans.is_list or f in LIST_FIELDS:
            fields[f] = json.dumps([x.strip() for x in v.split("||") if x.strip()])
        else:
            fields[f] = v
    if not fields:
        return {"success": False, "error": "No answers provided"}
    fields["setup_complete"] = 1
    set_clause = ", ".join(f"`{k}` = %s" for k in fields)
    with db() as cur:
        cur.execute(f"UPDATE profiles SET {set_clause} WHERE user_id = %s", list(fields.values()) + [user_id])
        cur.execute("SELECT * FROM profiles WHERE user_id = %s", (user_id,))
        row = row_to_dict(cur.fetchone())
    return {"success": True, "profile": row}


@router.post("/reset")
def reset_profile(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("""
            UPDATE profiles SET zip_code='', licenses_held=NULL, licenses_obtaining=NULL,
            cdl_experience='', endorsements=NULL, military_service='',
            moving_violations='', preventable_accidents='', driver_type='',
            owner_operator_interest='', solo_or_team='', team_interest='',
            freight_current=NULL, freight_interested=NULL, best_contact_time='',
            agreed_to_terms='', career_goals='', setup_complete=0
            WHERE user_id = %s
        """, (user_id,))
    return {"success": True}
